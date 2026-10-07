import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, RefreshCw, Sparkles, Trash2, FileCheck2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { settingsQuery } from "@/lib/queries";
import { ESTIMATE_DISCLAIMER, ESTIMATE_SECTIONS, formatCHF, roundTo } from "@/lib/app";
import { breakdownFromGuide, estimateFromGuide, type GuideLine } from "@/lib/price-guide";
import { useAnalyzeAndApply } from "@/components/job/AiAnalysis";

export function CostEstimate({ jobId, onWantsOffer, onDeclined }: { jobId: string; onWantsOffer: () => void; onDeclined: () => void }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const ai = useAnalyzeAndApply(jobId);
  const est = useQuery({
    queryKey: ["estimates", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_estimates").select("*, cost_estimate_items(*)").eq("job_id", jobId).order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const lines = useQuery({
    queryKey: ["estimate-lines", jobId],
    queryFn: () => guideInput(jobId).then(([m, l]) => breakdownFromGuide(m, l)),
  });
  const cur = est.data?.[0];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["estimates", jobId] });
    qc.invalidateQueries({ queryKey: ["estimate-lines", jobId] });
  };

  async function writeEstimate() {
    const [m, l] = await guideInput(jobId);
    const amounts = estimateFromGuide(m, l);
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
    await ai.analyze();
    try { await writeEstimate(); toast.success("Grobkosten berechnet"); } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); }
  }
  const [updating, setUpdating] = useState(false);
  async function update() {
    setUpdating(true);
    try { await writeEstimate(); toast.success("Grobkosten aktualisiert"); } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); } finally { setUpdating(false); }
  }

  const aiButton = (
    <button onClick={analyzeAndCalc} disabled={ai.busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60">
      <Sparkles className="h-5 w-5" /> {ai.busy ? "KI wertet Begehung aus…" : "Mit KI analysieren"}
    </button>
  );

  if (!cur) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">Die KI wertet Fotos, Sprach- und Textnotizen der Begehung aus und erstellt eine Grobkostenschätzung mit Schweizer Richtpreisen.</p>
        {aiButton}
      </div>
    );
  }

  const items = [...cur.cost_estimate_items].sort((a, b) => a.sort_order - b.sort_order);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const tol = Number(cur.tolerance);
  const shown = cur.visibility === "dem Kunden gezeigt";

  return (
    <div className="space-y-3">
      {aiButton}
      <div className="rounded-xl border-2 border-primary bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geschätzte Kosten (exkl. MWST)</div>
        <div className="font-mono text-3xl font-medium text-primary">{formatCHF(roundTo(total))}</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rahmen ±{tol}%</div>
        <div className="font-mono text-lg">{formatCHF(roundTo(total * (1 - tol / 100)))} – {formatCHF(roundTo(total * (1 + tol / 100)))}</div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
      </div>

      <button onClick={update} disabled={updating} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-primary disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} /> Mit aktuellem Material & Arbeit aktualisieren
      </button>

      <div className="divide-y rounded-xl border bg-card">
        {items.map((it) => <EstimateRow key={it.id} item={it} lines={(lines.data ?? []).filter((l) => l.section === it.section && it.description === it.section)} onChange={refresh} />)}
        <button onClick={async () => { await supabase.from("cost_estimate_items").insert({ estimate_id: cur.id, section: "Sonstiges", description: "Neue Position", sort_order: items.length }); refresh(); }}
          className="flex h-12 w-full items-center justify-center gap-1 text-sm font-semibold text-primary"><Plus className="h-4 w-4" /> Position hinzufügen</button>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2">
        <span className="text-sm font-medium">Toleranz ±%</span>
        <Input key={cur.id + "t"} className="h-11 w-24 text-right text-base" type="number" inputMode="decimal" defaultValue={tol}
          onBlur={async (e) => { await supabase.from("cost_estimates").update({ tolerance: Number(e.target.value) || 0 }).eq("id", cur.id); refresh(); }} />
      </label>

      <section className="space-y-2 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <h3 className="text-base font-semibold">Dem Kunden gezeigt – wie geht es weiter?</h3>
        {shown && <p className="text-xs text-muted-foreground">Schätzung wurde dem Kunden gezeigt.</p>}
        <button
          onClick={async () => { await supabase.from("cost_estimates").update({ visibility: "dem Kunden gezeigt" }).eq("id", cur.id); onWantsOffer(); }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground"
        ><FileCheck2 className="h-5 w-5" /> Kunde will Offerte</button>
        <button
          onClick={async () => { await supabase.from("cost_estimates").update({ visibility: "dem Kunden gezeigt" }).eq("id", cur.id); onDeclined(); }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card font-semibold text-destructive"
        ><XCircle className="h-5 w-5" /> Kunde hat abgesagt</button>
      </section>
    </div>
  );
}

async function guideInput(jobId: string) {
  const [{ data: lab }, { data: mat }] = await Promise.all([
    supabase.from("labour_items").select("description, hours, hourly_rate, source").eq("job_id", jobId),
    supabase.from("material_requirements").select("description, quantity, material_categories(name)").eq("job_id", jobId),
  ]);
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
  return (
    <div className="p-2">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Details" onClick={() => setOpen(!open)} className="flex h-11 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <Input className="h-11 flex-1 text-base" value={d} onChange={(e) => setD(e.target.value)} onBlur={save} />
        <Input className="h-11 w-28 text-right font-mono text-base" type="number" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} onBlur={save} />
        <button aria-label="Entfernen" onClick={async () => { await supabase.from("cost_estimate_items").delete().eq("id", item.id); onChange(); }} className="flex h-11 w-9 items-center justify-center text-destructive"><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="ml-11 mt-1 space-y-1 rounded-lg bg-muted/60 p-2 text-sm">
          {lines.length ? lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-2">
              <div className="min-w-0"><div>{l.label}</div><div className="text-xs text-muted-foreground">{l.detail}</div></div>
              <span className="shrink-0 font-mono">{formatCHF(l.amount)}</span>
            </div>
          )) : <p className="text-muted-foreground">Keine Positionen aus der Begehung.</p>}
        </div>
      )}
    </div>
  );
}
