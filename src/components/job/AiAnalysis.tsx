import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/Brand";
import { analyzeJob } from "@/lib/ai.functions";
import { buildEstimate, saveEstimate } from "@/lib/estimate-build";
import { categoriesQuery, settingsQuery } from "@/lib/queries";
import { LABOUR_ITEM_TASK, OPEN_STATUSES, type Labour, type Material } from "@/lib/app";
import { hourlyRateFromSettings, MISSING_RATE } from "@/lib/commercial";
import { bucketForMaterials, discardHint, sectionHourHint } from "@/lib/company-experience";
import { companyExperienceQuery, recordSuggestionDecision } from "@/lib/company-experience-data";
import { catalogWorkKeys, isLabourTask, resolveWorkKey, workKeyLabel } from "@/lib/labour-grouping";
import { useLabour } from "./LabourList";
import { useMaterials } from "./MaterialList";

type P = Record<string, unknown>;
type Suggestion = { id: string; kind: string; payload: unknown; confidence: string | null };

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseQty(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stepQty(current: number | null, delta: number): number | null {
  const next = Math.round(((current ?? 0) + delta) * 4) / 4;
  return next > 0 ? next : null;
}

function qtyText(value: number | null) {
  return value == null ? "" : String(value);
}

function readTask(payload: unknown) {
  const p = (payload ?? {}) as P;
  const stored = p["arbeit_key"];
  const rubric = p["rubrik"];
  const hours = p["stunden"];
  const note = p["notiz"];
  const description = p["beschreibung"];
  return {
    text: s(description) ?? "",
    hours: typeof hours === "number" && hours > 0 ? hours : null,
    key: typeof stored === "string" && catalogWorkKeys().includes(stored) ? stored : resolveWorkKey(s(rubric)),
    note: s(note),
  };
}

export function AiAnalysis({ jobId }: {
  jobId: string;
  onEditMaterial: (d: Partial<Material> & { job_id: string; suggestionId?: string; aiQuantity?: number; fromHistory?: boolean }) => void;
  onEditLabour: (d: Partial<Labour> & { job_id: string; suggestionId?: string; aiHours?: number; shownHours?: number; fromHistory?: boolean }) => void;
}) {
  const qc = useQueryClient();
  const run = useServerFn(analyzeJob);
  const [busy, setBusy] = useState(false);
  const cats = useQuery(categoriesQuery());
  const settings = useQuery(settingsQuery());
  const experience = useQuery(companyExperienceQuery(jobId));
  const materials = useMaterials(jobId);
  const labour = useLabour(jobId);
  const sugg = useQuery({
    queryKey: ["ai", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_suggestions").select("*").eq("job_id", jobId).eq("state", "pending").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function analyze() {
    setBusy(true);
    try {
      const r = await run({ data: { jobId } });
      if (r.nothingNew) {
        toast.message("Keine neuen Aufnahmen – bereits ausgewertete Notizen werden nicht nochmals ausgewertet.");
      } else if (r.skippedDocuments?.length) {
        toast.success(r.count ? `${r.count} Anforderungen erkannt` : "Auswertung abgeschlossen");
        toast.message(`Nicht automatisch ausgewertet: ${r.skippedDocuments.join(", ")}`);
      } else {
        toast.success(r.count ? `${r.count} Anforderungen erkannt` : "Nichts erkannt – mehr Notizen erfassen");
      }
      qc.invalidateQueries({ queryKey: ["ai", jobId] });
      if (!r.nothingNew) {
        const built = await buildEstimate(jobId, settings.data, experience.data?.observations ?? []);
        if ("error" in built) toast.error(built.error);
        else {
          await saveEstimate(jobId, built);
          qc.invalidateQueries({ queryKey: ["estimates", jobId] });
          toast.success("Grobkosten automatisch berechnet");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auswertung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const bucket = bucketForMaterials("project", (materials.data ?? []).map((m) => ({
    category: cats.data?.find((c) => c.id === m.category_id)?.name ?? null,
    quantity: Number(m.quantity),
  })));
  const observations = experience.data?.observations ?? [];
  const corrections = experience.data?.corrections ?? [];
  const list = sugg.data ?? [];
  const tasks = (labour.data ?? []).filter(isLabourTask);
  const confirmedMaterials = materials.data ?? [];

  async function decide(id: string, payload: P, decision: "accept" | "edit" | "discard", accepted: number | null) {
    await recordSuggestionDecision(id, payload, decision, accepted, false);
    qc.invalidateQueries({ queryKey: ["ai", jobId] });
    qc.invalidateQueries({ queryKey: ["company-experience"] });
  }

  async function acceptLabour(row: Suggestion, draft: { text: string; hours: number; key: string }) {
    const rate = hourlyRateFromSettings(settings.data);
    if (rate == null) {
      toast.error(MISSING_RATE);
      return;
    }
    const { error } = await supabase.from("labour_items").insert({
      job_id: jobId,
      description: draft.text.trim(),
      hours: draft.hours,
      hourly_rate: rate,
      notes: readTask(row.payload).note,
      confidence: row.confidence,
      source: "ai",
      item_type: LABOUR_ITEM_TASK,
      parent_id: null,
      work_key: draft.key,
      sort_order: Date.now() % 1e9,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const p = (row.payload ?? {}) as P;
    await decide(row.id, { ...p, beschreibung: draft.text.trim(), arbeit_key: draft.key, stunden: draft.hours }, "accept", draft.hours);
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
  }

  async function acceptMaterial(row: Suggestion, draft: { text: string; quantity: number; unit: string; categoryId: string | null }) {
    const p = (row.payload ?? {}) as P;
    const { error } = await supabase.from("material_requirements").insert({
      job_id: jobId,
      category_id: draft.categoryId,
      description: draft.text.trim(),
      quantity: draft.quantity,
      unit: draft.unit.trim() || "Stk",
      dimensions: s(p["dimension"]),
      finish: s(p["ausfuehrung"]),
      notes: s(p["notiz"]),
      status: "Offen",
      confidence: row.confidence,
      source: "ai",
      product_id: null,
      sort_order: Date.now() % 1e9,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await decide(row.id, { ...p, beschreibung: draft.text.trim(), menge: draft.quantity, einheit: draft.unit }, "accept", draft.quantity);
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
  }

  async function acceptOpen(row: Suggestion, text: string) {
    const { error } = await supabase.from("open_questions").insert({ job_id: jobId, text, source: "ai" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await decide(row.id, { text }, "accept", null);
    qc.invalidateQueries({ queryKey: ["open", jobId] });
  }

  async function discard(row: Suggestion) {
    await decide(row.id, (row.payload ?? {}) as P, "discard", null);
  }

  return (
    <section className="space-y-3">
      <button onClick={analyze} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary bg-card text-base font-semibold text-primary disabled:opacity-60">
        <Sparkles className="h-5 w-5" /> {busy ? "Wird ausgewertet…" : "Analysieren"}
      </button>
      {list.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="section-title">Vorschläge prüfen</h2>
            <p className="mt-1 text-xs text-muted-foreground">Eine Karte pro Schritt. Rubrik und Stunden bestätigen, bevor der Schritt zum Auftrag gehört. Eine erneute Analyse nimmt nur neue Aufnahmen dazu.</p>
          </div>
          {list.filter((r) => r.kind === "labour").map((r) => (
            <LabourProposal
              key={r.id}
              row={r}
              hintFor={(key) => sectionHourHint(key, bucket, observations)}
              discardFor={(key) => (key ? discardHint(corrections, key) : null)}
              onAccept={(draft) => acceptLabour(r, draft)}
              onDiscard={() => discard(r)}
            />
          ))}
          {list.filter((r) => r.kind === "material").map((r) => (
            <MaterialProposal
              key={r.id}
              row={r}
              categories={cats.data ?? []}
              onAccept={(draft) => acceptMaterial(r, draft)}
              onDiscard={() => discard(r)}
            />
          ))}
          {list.filter((r) => r.kind === "open").map((r) => {
            const text = s(((r.payload ?? {}) as P)["text"]) ?? "";
            return (
              <div key={r.id} className="rounded-xl border bg-card p-3">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-6 w-6" onChange={() => text && acceptOpen(r, text)} />
                  <span className="text-base font-medium">{text}</span>
                </label>
                <button onClick={() => discard(r)} className="mt-3 flex h-12 w-full items-center justify-center gap-1 rounded-lg border text-sm font-semibold text-muted-foreground"><X className="h-4 w-4" />Verwerfen</button>
              </div>
            );
          })}
        </div>
      )}
      {(tasks.length > 0 || confirmedMaterials.length > 0) && (
        <div className="space-y-3">
          <h2 className="section-title">Bestätigt</h2>
          {tasks.map((task) => (
            <ConfirmedTask key={task.id} task={task} hint={sectionHourHint(task.work_key, bucket, observations)} onSaved={() => qc.invalidateQueries({ queryKey: ["labour", jobId] })} />
          ))}
          {confirmedMaterials.map((item) => (
            <ConfirmedMaterial key={item.id} item={item} categories={cats.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["materials", jobId] })} />
          ))}
        </div>
      )}
    </section>
  );
}

function LabourProposal({ row, hintFor, discardFor, onAccept, onDiscard }: {
  row: Suggestion;
  hintFor: (key: string | null) => string | null;
  discardFor: (key: string | null) => string | null;
  onAccept: (draft: { text: string; hours: number; key: string }) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const initial = readTask(row.payload);
  const [text, setText] = useState(initial.text);
  const [hours, setHours] = useState(qtyText(initial.hours));
  const [key, setKey] = useState<string | null>(initial.key);
  const [saving, setSaving] = useState(false);
  const parsed = parseQty(hours);
  const ready = Boolean(text.trim() && key && parsed != null);
  async function accept() {
    if (!ready || !key || parsed == null) return;
    setSaving(true);
    try { await onAccept({ text, hours: parsed, key }); }
    finally { setSaving(false); }
  }
  return (
    <article className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arbeit</span>
        {row.confidence && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Sicherheit: {row.confidence}</span>}
      </div>
      <Input className="h-12 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <HourField value={hours} onChange={setHours} />
      <WorkChips value={key} onChange={setKey} />
      {!key && <p className="text-sm font-medium text-destructive">Kategorie wählen, bevor der Schritt übernommen wird.</p>}
      {hintFor(key) && <p className="text-sm text-muted-foreground">{hintFor(key)}</p>}
      {discardFor(key) && <p className="text-sm text-muted-foreground">{discardFor(key)}</p>}
      {initial.note && <p className="text-sm text-muted-foreground">{initial.note}</p>}
      <div className="grid grid-cols-1 gap-2">
        <button onClick={accept} disabled={!ready || saving} className="flex h-12 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"><Check className="h-4 w-4" />Übernehmen</button>
        <button onClick={onDiscard} className="flex h-12 items-center justify-center gap-1 rounded-lg border text-sm font-semibold text-muted-foreground"><X className="h-4 w-4" />Verwerfen</button>
      </div>
    </article>
  );
}

function MaterialProposal({ row, categories, onAccept, onDiscard }: {
  row: Suggestion;
  categories: { id: string; name: string }[];
  onAccept: (draft: { text: string; quantity: number; unit: string; categoryId: string | null }) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const p = (row.payload ?? {}) as P;
  const match = categories.find((c) => c.name.toLowerCase() === String(p["kategorie"] ?? "").toLowerCase());
  const [text, setText] = useState(s(p["beschreibung"]) ?? "");
  const menge = p["menge"];
  const [qty, setQty] = useState(qtyText(typeof menge === "number" && menge > 0 ? menge : null));
  const [unit, setUnit] = useState(s(p["einheit"]) ?? "Stk");
  const [categoryId, setCategoryId] = useState<string | null>(match?.id ?? null);
  const [saving, setSaving] = useState(false);
  const parsed = parseQty(qty);
  const ready = Boolean(text.trim() && parsed != null);
  async function accept() {
    if (!ready || parsed == null) return;
    setSaving(true);
    try { await onAccept({ text, quantity: parsed, unit, categoryId }); }
    finally { setSaving(false); }
  }
  return (
    <article className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material</span>
        {row.confidence && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Sicherheit: {row.confidence}</span>}
      </div>
      <Input className="h-12 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <div className="min-w-0 flex-1"><QtyField value={qty} onChange={setQty} step={1} label="Menge" /></div>
        <Input className="h-12 w-24 text-base" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Einheit" />
      </div>
      <CategoryChips options={categories} value={categoryId} onChange={setCategoryId} />
      <div className="grid grid-cols-1 gap-2">
        <button onClick={accept} disabled={!ready || saving} className="flex h-12 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"><Check className="h-4 w-4" />Übernehmen</button>
        <button onClick={onDiscard} className="flex h-12 items-center justify-center gap-1 rounded-lg border text-sm font-semibold text-muted-foreground"><X className="h-4 w-4" />Verwerfen</button>
      </div>
    </article>
  );
}

function ConfirmedTask({ task, hint, onSaved }: { task: Labour; hint: string | null; onSaved: () => void }) {
  const [text, setText] = useState(task.description);
  const [hours, setHours] = useState(qtyText(Number(task.hours) > 0 ? Number(task.hours) : null));
  const [key, setKey] = useState<string | null>(task.work_key);
  const parsed = parseQty(hours);
  const dirty = text.trim() !== task.description || parsed !== Number(task.hours) || key !== task.work_key;
  async function save() {
    if (!text.trim() || !key || parsed == null) return;
    const { error } = await supabase.from("labour_items").update({ description: text.trim(), hours: parsed, work_key: key }).eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved();
  }
  return (
    <article className="space-y-3 rounded-xl border bg-card p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arbeit</span>
      <Input className="h-12 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <HourField value={hours} onChange={setHours} />
      <WorkChips value={key} onChange={setKey} />
      {!key && <p className="text-sm font-medium text-destructive">Kategorie wählen.</p>}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {dirty && (
        <button onClick={save} disabled={!text.trim() || !key || parsed == null} className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40">Speichern</button>
      )}
    </article>
  );
}

function ConfirmedMaterial({ item, categories, onSaved }: {
  item: Material;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [text, setText] = useState(item.description);
  const [qty, setQty] = useState(qtyText(Number(item.quantity) > 0 ? Number(item.quantity) : null));
  const [unit, setUnit] = useState(item.unit);
  const [categoryId, setCategoryId] = useState<string | null>(item.category_id);
  const [openCats, setOpenCats] = useState(false);
  const parsed = parseQty(qty);
  const dirty = text.trim() !== item.description || parsed !== Number(item.quantity) || unit !== item.unit || categoryId !== item.category_id;
  const categoryName = categories.find((c) => c.id === categoryId)?.name;
  async function save() {
    if (!text.trim() || parsed == null) return;
    const { error } = await supabase.from("material_requirements").update({
      description: text.trim(), quantity: parsed, unit: unit.trim() || "Stk", category_id: categoryId,
    }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved();
  }
  return (
    <article className="space-y-3 rounded-xl border bg-card p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material</span>
      <Input className="h-12 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <div className="min-w-0 flex-1"><QtyField value={qty} onChange={setQty} step={1} label="Menge" /></div>
        <Input className="h-12 w-24 text-base" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Einheit" />
      </div>
      <button type="button" onClick={() => setOpenCats((v) => !v)} className="flex h-11 items-center rounded-full border px-3 text-sm font-semibold">
        {categoryName ?? "Kategorie wählen"}
      </button>
      {openCats && <CategoryChips options={categories} value={categoryId} onChange={(id) => { setCategoryId(id); setOpenCats(false); }} />}
      {dirty && (
        <button onClick={save} disabled={!text.trim() || parsed == null} className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40">Speichern</button>
      )}
    </article>
  );
}

function HourField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <QtyField value={value} onChange={onChange} step={0.25} label="Stunden" suffix="h" />;
}

function QtyField({ value, onChange, step, label, suffix }: {
  value: string;
  onChange: (value: string) => void;
  step: number;
  label: string;
  suffix?: string;
}) {
  const current = parseQty(value);
  function setFrom(n: number | null) {
    onChange(n == null ? "" : String(n));
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`${label} verringern`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-xl" onClick={() => setFrom(stepQty(current, -step))}>−</button>
      <Input className="h-12 text-center text-base" inputMode="decimal" value={value} placeholder={label} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      {suffix && <span className="text-sm font-semibold">{suffix}</span>}
      <button type="button" aria-label={`${label} erhöhen`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-xl" onClick={() => setFrom(stepQty(current, step))}>+</button>
    </div>
  );
}

function WorkChips({ value, onChange }: { value: string | null; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {catalogWorkKeys().map((key) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`h-11 rounded-full border px-3 text-sm font-semibold ${value === key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
          {workKeyLabel(key)}
        </button>
      ))}
    </div>
  );
}

function CategoryChips({ options, value, onChange }: {
  options: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id)} className={`h-11 rounded-full border px-3 text-sm font-semibold ${value === option.id ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
          {option.name}
        </button>
      ))}
    </div>
  );
}

export function OpenQuestions({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const q = useQuery({
    queryKey: ["open", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("open_questions").select("*").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["open", jobId] });
  async function add() {
    if (!text.trim()) return;
    await supabase.from("open_questions").insert({ job_id: jobId, text: text.trim() });
    setText("");
    refresh();
  }
  const list = q.data ?? [];
  const openCount = list.filter((o) => o.status === "offen").length;
  return (
    <section className="space-y-2">
      <h2 className="section-title">Offene Punkte {openCount > 0 && <span className="ml-1 rounded bg-warning/20 px-1.5 text-foreground">{openCount}</span>}</h2>
      {list.map((o) => (
        <div key={o.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <span className={`font-medium ${o.status !== "offen" ? "text-muted-foreground line-through" : ""}`}>{o.text}</span>
            <StatusBadge status={o.status} />
          </div>
          <div className="mt-2 flex gap-1.5">
            {OPEN_STATUSES.map((st) => (
              <button key={st} onClick={async () => { await supabase.from("open_questions").update({ status: st }).eq("id", o.id); refresh(); }}
                className={`h-9 flex-1 rounded-lg border text-xs font-semibold ${o.status === st ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{st}</button>
            ))}
            <button aria-label="Löschen" onClick={async () => { await supabase.from("open_questions").delete().eq("id", o.id); refresh(); }} className="flex h-9 w-9 items-center justify-center rounded-lg border text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input className="h-12 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="z.B. Anschlussart prüfen" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} aria-label="Hinzufügen" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></button>
      </div>
    </section>
  );
}
