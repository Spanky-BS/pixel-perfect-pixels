import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Minus, Plus, RefreshCw, Sparkles, Trash2, FileCheck2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { settingsQuery } from "@/lib/queries";
import { ESTIMATE_DISCLAIMER, ESTIMATE_SECTIONS, formatCHF, roundTo } from "@/lib/app";
import { breakdownFromGuide, estimateFromGuide, type GuideLine, type GuideMaterial, type GuideLabour } from "@/lib/price-guide";
import { clearAiItems, useAnalyzeAndApply } from "@/components/job/AiAnalysis";

async function hasCaptures(jobId: string) {
  const r = await Promise.all(["voice_notes", "job_photos", "job_documents"].map((t) =>
    supabase.from(t as "voice_notes").select("id", { count: "exact", head: true }).eq("job_id", jobId)));
  return r.some((x) => (x.count ?? 0) > 0);
}

export function CostEstimate({ jobId, onWantsOffer, onDeclined, questions }: { jobId: string; onWantsOffer: () => void; onDeclined: () => void; questions?: React.ReactNode }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const ai = useAnalyzeAndApply(jobId);
  const rates = { vehiclePerDay: Number(settings.data?.estimate_vehicle_per_day ?? 50), smallMaterialPct: Number(settings.data?.estimate_small_material_pct ?? 5) };
  const est = useQuery({
    queryKey: ["estimates", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_estimates").select("*, cost_estimate_items(*)").eq("job_id", jobId).order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const lines = useQuery({
    queryKey: ["estimate-lines", jobId, rates.vehiclePerDay, rates.smallMaterialPct],
    queryFn: () => guideInput(jobId).then(([m, l]) => breakdownFromGuide(m, l, rates)),
    enabled: !!settings.data,
  });
  const cur = est.data?.[0];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["estimates", jobId] });
    qc.invalidateQueries({ queryKey: ["estimate-lines", jobId] });
  };

  async function writeEstimate() {
    const [m, l] = await guideInput(jobId);
    const amounts = estimateFromGuide(m, l, rates);
    const note = `Berechnet am ${new Date().toLocaleString("de-CH")} aus Begehung (Schweizer Richtwerte)`;
    if (!cur) {
      const { data, error } = await supabase.from("cost_estimates")
        .insert({ job_id: jobId, version: 1, tolerance: Number(settings.data?.estimate_tolerance ?? 20), notes: note })
        .select("id").single();
      if (error) throw error;
      await supabase.from("cost_estimate_items").insert(ESTIMATE_SECTIONS.map((section, i) => ({ estimate_id: data.id, section, description: section, amount: amounts[section] ?? 0, sort_order: i })));
    } else {
      const existing = cur.cost_estimate_items;
      await Promise.all(ESTIMATE_SECTIONS.map((section, i) => {
        const row = existing.find((it) => it.section === section && it.description === section);
        const amount = amounts[section] ?? 0;
        if (row) return supabase.from("cost_estimate_items").update({ amount }).eq("id", row.id);
        return supabase.from("cost_estimate_items").insert({ estimate_id: cur.id, section, description: section, amount, sort_order: i });
      }));
      await supabase.from("cost_estimates").update({ notes: note }).eq("id", cur.id);
    }
    refresh();
  }

  async function analyzeAndCalc() {
    const ok = await ai.analyze();
    if (ok === null) return; // AI failed: keep the current estimate untouched
    try { await writeEstimate(); toast.success("Grobkosten berechnet"); } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); }
  }
  const [updating, setUpdating] = useState(false);
  const [tolDraft, setTolDraft] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  async function update() {
    setUpdating(true);
    try {
      if (!(await hasCaptures(jobId))) {
        await clearAiItems(jobId, true);
        ["materials", "labour", "open"].forEach((k) => qc.invalidateQueries({ queryKey: [k, jobId] }));
      }
      await writeEstimate(); toast.success("Grobkosten aktualisiert");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); } finally { setUpdating(false); }
  }

  if (!cur) {
    return (
      <div className="space-y-4">
        <section className="surface space-y-4 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.08] text-primary"><Sparkles className="h-6 w-6" strokeWidth={1.75} /></div>
          <div>
            <h2 className="text-lg font-semibold">Grobkosten erstellen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Die KI wertet Fotos, Sprach- und Textnotizen der Begehung aus und rechnet mit Schweizer Richtpreisen.</p>
          </div>
          <button onClick={analyzeAndCalc} disabled={ai.busy} className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60" style={{ boxShadow: "var(--shadow-primary)" }}>
            <Sparkles className="h-5 w-5" /> {ai.busy ? "KI wertet Begehung aus…" : "Mit KI analysieren"}
          </button>
        </section>
        {questions}
      </div>
    );
  }

  const items = [...cur.cost_estimate_items].sort((a, b) => a.sort_order - b.sort_order);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const tol = tolDraft ?? Number(cur.tolerance);
  const shown = cur.visibility === "dem Kunden gezeigt";
  const addItem = async (description: string) => {
    await supabase.from("cost_estimate_items").insert({ estimate_id: cur.id, section: "Sonstiges", description, sort_order: items.length });
    setAdding(false); setCustom(""); refresh();
  };
  const saveTol = async (v: number) => {
    const next = Math.max(0, Math.min(50, v));
    setTolDraft(next);
    await supabase.from("cost_estimates").update({ tolerance: next }).eq("id", cur.id);
    await qc.invalidateQueries({ queryKey: ["estimates", jobId] });
    setTolDraft(null);
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl bg-primary text-primary-foreground" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}>
        <div className="p-5 pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Geschätzte Kosten · exkl. MWST</div>
          <div className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular">{formatCHF(roundTo(total))}</div>
          <div className="mt-2 text-sm opacity-80 tabular">{formatCHF(roundTo(total * (1 - tol / 100)))} – {formatCHF(roundTo(total * (1 + tol / 100)))}</div>
        </div>
        <div className="flex items-center justify-between border-t border-primary-foreground/15 px-5 py-2.5">
          <span className="text-sm opacity-80">Toleranz</span>
          <div className="flex items-center gap-1">
            <button aria-label="Toleranz verringern" onClick={() => saveTol(tol - 5)} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/10 active:bg-primary-foreground/20"><Minus className="h-4 w-4" /></button>
            <label className="flex w-16 items-center justify-center text-base font-semibold tabular">±<input aria-label="Toleranz in Prozent" type="number" inputMode="numeric" value={tol}
              onChange={(e) => setTolDraft(e.target.value === "" ? 0 : Number(e.target.value))} onBlur={() => tolDraft !== null && saveTol(tolDraft)}
              className="w-8 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />%</label>
            <button aria-label="Toleranz erhöhen" onClick={() => saveTol(tol + 5)} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/10 active:bg-primary-foreground/20"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={update} disabled={updating || ai.busy} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium disabled:opacity-60" style={{ boxShadow: "var(--shadow-card)" }}>
          <RefreshCw className={`h-4 w-4 text-primary ${updating ? "animate-spin" : ""}`} /> Aktualisieren
        </button>
        <button onClick={analyzeAndCalc} disabled={ai.busy || updating} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium disabled:opacity-60" style={{ boxShadow: "var(--shadow-card)" }}>
          <Sparkles className={`h-4 w-4 text-primary ${ai.busy ? "animate-pulse" : ""}`} /> {ai.busy ? "KI arbeitet…" : "Neu mit KI"}
        </button>
      </div>

      {questions}

      <section className="space-y-2">
        <h2 className="section-title px-1">Rubriken · antippen für Details</h2>
        <div className="list-group">
          {items.map((it) => <EstimateRow key={it.id} item={it} lines={(lines.data ?? []).filter((l) => l.section === it.section && it.description === it.section)} onChange={refresh} />)}
          {adding ? (
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap gap-1.5">
                {ADD_PRESETS.map((p) => (
                  <button key={p} onClick={() => addItem(p)} className="h-9 rounded-full border border-border bg-muted/50 px-3 text-sm">{p}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input className="h-10 flex-1 text-[15px]" placeholder="Eigene Position…" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button disabled={!custom.trim()} onClick={() => addItem(custom.trim())} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Hinzufügen</button>
              </div>
              <button onClick={() => setAdding(false)} className="h-9 w-full text-sm text-muted-foreground">Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-1 text-sm font-medium text-primary active:bg-muted"><Plus className="h-4 w-4" /> Position hinzufügen</button>
          )}
        </div>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
      </section>

      <section className="surface space-y-3 p-4">
        <div>
          <h3 className="text-[15px] font-semibold">Kundenentscheid</h3>
          <p className="text-xs text-muted-foreground">{shown ? "Schätzung wurde dem Kunden gezeigt." : "Nachdem du dem Kunden die Schätzung gezeigt hast."}</p>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            onClick={async () => { await supabase.from("cost_estimates").update({ visibility: "dem Kunden gezeigt" }).eq("id", cur.id); onWantsOffer(); }}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
          ><FileCheck2 className="h-5 w-5" /> Kunde will Offerte</button>
          <button
            onClick={async () => { await supabase.from("cost_estimates").update({ visibility: "dem Kunden gezeigt" }).eq("id", cur.id); onDeclined(); }}
            className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-destructive"
          ><XCircle className="h-4 w-4" /> Abgesagt</button>
        </div>
      </section>
    </div>
  );
}

const ADD_PRESETS = [
  "Bohr- und Spitzarbeiten",
  "Gerüst / Abdeckarbeiten",
  "Platten- / Gipserarbeiten",
  "Elektroanschluss / Zuleitung",
  "Zusätzliche Sanitärapparate",
  "Zusätzliche Armaturen",
  "Zusätzlicher Arbeitsaufwand",
  "Spezialentsorgung / Mulde",
];

/** Begehung data drives the numbers: with no captures left, everything is 0. */
async function guideInput(jobId: string) {
  const [{ data: lab }, { data: mat }, { count: nNotes }, { count: nPhotos }, { count: nDocs }] = await Promise.all([
    supabase.from("labour_items").select("description, hours, hourly_rate, source").eq("job_id", jobId),
    supabase.from("material_requirements").select("description, quantity, material_categories(name)").eq("job_id", jobId),
    supabase.from("voice_notes").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    supabase.from("job_photos").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    supabase.from("job_documents").select("id", { count: "exact", head: true }).eq("job_id", jobId),
  ]);
  if (!(nNotes || nPhotos || nDocs)) return [[] as GuideMaterial[], [] as GuideLabour[]] as const;
  return [
    (mat ?? []).map((m) => ({ description: m.description, quantity: Number(m.quantity), category: (m.material_categories as { name: string } | null)?.name })),
    (lab ?? []).filter((l) => l.source !== "execution").map((l) => ({ description: l.description, hours: Number(l.hours), hourly_rate: Number(l.hourly_rate) })),
  ] as const;
}

function EstimateRow({ item, lines, onChange }: { item: { id: string; description: string; amount: number }; lines: GuideLine[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(item.description);
  const [a, setA] = useState(String(item.amount));
  useEffect(() => { setD(item.description); setA(String(item.amount)); }, [item.description, item.amount]);
  async function save() {
    if (d === item.description && Number(a) === Number(item.amount)) return;
    await supabase.from("cost_estimate_items").update({ description: d, amount: Number(a) || 0 }).eq("id", item.id);
    onChange();
  }
  const amount = Number(item.amount);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 py-2.5 text-left active:bg-muted/60">
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className={`min-w-0 flex-1 truncate text-[15px] ${amount ? "" : "text-muted-foreground"}`}>{item.description}</span>
        {lines.length > 0 && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular">{lines.length}</span>}
        <span className={`w-24 shrink-0 text-right text-[15px] font-medium tabular ${amount ? "" : "text-muted-foreground"}`}>{formatCHF(roundTo(amount))}</span>
      </button>
      {open && (
        <div className="space-y-3 bg-muted/40 px-4 pb-3 pt-1">
          {lines.length > 0 ? (
            <div className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3 px-3 py-2">
                  <div className="min-w-0"><div>{l.label}</div><div className="text-xs text-muted-foreground">{l.detail}</div></div>
                  <span className="shrink-0 tabular">{formatCHF(l.amount)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Keine Positionen aus der Begehung.</p>}
          <div className="flex items-center gap-2">
            <Input aria-label="Bezeichnung" className="h-10 flex-1 bg-card text-[15px]" value={d} onChange={(e) => setD(e.target.value)} onBlur={save} />
            <Input aria-label="Betrag CHF" className="h-10 w-28 bg-card text-right text-[15px] tabular" type="number" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} onBlur={save} />
            <button aria-label="Entfernen" onClick={async () => { if (!confirm("Position entfernen?")) return; await supabase.from("cost_estimate_items").delete().eq("id", item.id); onChange(); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive active:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
