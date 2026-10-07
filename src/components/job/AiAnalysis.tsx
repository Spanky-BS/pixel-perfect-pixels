import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check, Pencil, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/Brand";
import { analyzeJob } from "@/lib/ai.functions";
import { categoriesQuery, settingsQuery } from "@/lib/queries";
import { OPEN_STATUSES, type Labour, type Material } from "@/lib/app";

type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function AiAnalysis({ jobId, onEditMaterial, onEditLabour }: {
  jobId: string;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
}) {
  const qc = useQueryClient();
  const run = useServerFn(analyzeJob);
  const [busy, setBusy] = useState(false);
  const cats = useQuery(categoriesQuery());
  const settings = useQuery(settingsQuery());
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auswertung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const catId = (name: unknown) => cats.data?.find((c) => c.name.toLowerCase() === String(name ?? "").toLowerCase())?.id ?? null;
  const toMaterial = (p: P, conf: string | null) => ({
    job_id: jobId, category_id: catId(p["kategorie"]), description: s(p["beschreibung"]) ?? "", quantity: n(p["menge"], 1), unit: s(p["einheit"]) ?? "Stk",
    preferred_brand: s(p["marke"]), dimensions: s(p["dimension"]), finish: s(p["ausfuehrung"]), notes: s(p["notiz"]), status: "Offen", confidence: conf, source: "ai",
  });
  const toLabour = (p: P, conf: string | null) => ({
    job_id: jobId, description: s(p["beschreibung"]) ?? "", hours: n(p["stunden"], 1), hourly_rate: Number(settings.data?.default_hourly_rate ?? 120), notes: s(p["notiz"]), confidence: conf, source: "ai",
  });

  async function mark(id: string, state: "accepted" | "discarded") {
    await supabase.from("ai_suggestions").update({ state }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["ai", jobId] });
  }
  async function accept(row: { id: string; kind: string; payload: unknown; confidence: string | null }) {
    const p = (row.payload ?? {}) as P;
    let error;
    if (row.kind === "material") ({ error } = await supabase.from("material_requirements").insert({ ...toMaterial(p, row.confidence), sort_order: Date.now() % 1e9 }));
    else if (row.kind === "labour") ({ error } = await supabase.from("labour_items").insert({ ...toLabour(p, row.confidence), sort_order: Date.now() % 1e9 }));
    else ({ error } = await supabase.from("open_questions").insert({ job_id: jobId, text: String(p["text"] ?? ""), source: "ai" }));
    if (error) return toast.error(error.message);
    await mark(row.id, "accepted");
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
    qc.invalidateQueries({ queryKey: ["open", jobId] });
  }
  async function edit(row: { id: string; kind: string; payload: unknown; confidence: string | null }) {
    const p = (row.payload ?? {}) as P;
    if (row.kind === "material") onEditMaterial(toMaterial(p, row.confidence));
    else if (row.kind === "labour") onEditLabour(toLabour(p, row.confidence));
    else {
      const t = window.prompt("Offenen Punkt bearbeiten", String(p["text"] ?? ""));
      if (!t) return;
      await supabase.from("open_questions").insert({ job_id: jobId, text: t, source: "ai" });
      qc.invalidateQueries({ queryKey: ["open", jobId] });
    }
    await mark(row.id, "accepted");
  }

  const list = sugg.data ?? [];
  const groups = [
    ["material", "A · Material"],
    ["labour", "B · Arbeit"],
    ["open", "C · Offene Punkte"],
  ] as const;

  return (
    <section className="space-y-3">
      <button onClick={analyze} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary bg-card text-base font-semibold text-primary disabled:opacity-60">
        <Sparkles className="h-5 w-5" /> {busy ? "Wird ausgewertet…" : "Aufnahme auswerten"}
      </button>
      {list.length > 0 && (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="section-title">Erkannte Anforderungen</h2>
          <p className="text-xs text-muted-foreground">Bei erneutem Auswerten werden nur neue Aufnahmen berücksichtigt. Vorschläge prüfen. Fehlende Angaben werden nicht erfunden, sondern als offene Punkte aufgeführt.</p>
          {groups.map(([k, label]) => {
            const rows = list.filter((r) => r.kind === k);
            if (!rows.length) return null;
            return (
              <div key={k} className="space-y-2">
                <h3 className="text-sm font-bold">{label}</h3>
                {rows.map((r) => {
                  const p = (r.payload ?? {}) as P;
                  const meta = k === "material"
                    ? [s(p["kategorie"]), p["menge"] != null ? `${p["menge"]} ${s(p["einheit"]) ?? ""}` : null, s(p["marke"]), s(p["dimension"]), s(p["ausfuehrung"])]
                    : k === "labour" ? [p["stunden"] != null ? `${p["stunden"]} h` : null] : [];
                  return (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{s(p["beschreibung"]) ?? s(p["text"])}</span>
                        {r.confidence && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Sicherheit: {r.confidence}</span>}
                      </div>
                      {meta.filter(Boolean).length > 0 && <div className="mt-1 text-sm text-muted-foreground">{meta.filter(Boolean).join(" · ")}</div>}
                      {s(p["notiz"]) && <div className="mt-1 text-sm text-muted-foreground">{s(p["notiz"])}</div>}
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button onClick={() => accept(r)} className="flex h-10 items-center justify-center gap-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"><Check className="h-4 w-4" />Übernehmen</button>
                        <button onClick={() => edit(r)} className="flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-semibold"><Pencil className="h-4 w-4" />Bearbeiten</button>
                        <button onClick={() => mark(r.id, "discarded")} className="flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-semibold text-muted-foreground"><X className="h-4 w-4" />Verwerfen</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </section>
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
