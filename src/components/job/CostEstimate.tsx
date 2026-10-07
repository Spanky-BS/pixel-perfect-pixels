import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { settingsQuery } from "@/lib/queries";
import { CONFIDENCE, ESTIMATE_DISCLAIMER, formatCHF, formatDate, roundTo } from "@/lib/app";
import { companyExperienceQuery } from "@/lib/company-experience-data";
import { buildEstimate, saveEstimate } from "@/lib/estimate-build";
import type { GuideLine } from "@/lib/price-guide";

export function CostEstimate({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const experience = useQuery(companyExperienceQuery(jobId));
  const [sel, setSel] = useState<string | null>(null);
  const est = useQuery({
    queryKey: ["estimates", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_estimates").select("*, cost_estimate_items(*)").eq("job_id", jobId).order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const list = est.data ?? [];
  const cur = list.find((e) => e.id === sel) ?? list[0];
  const refresh = () => qc.invalidateQueries({ queryKey: ["estimates", jobId] });

  async function compute() {
    const built = await buildEstimate(jobId, settings.data, experience.data?.observations ?? []);
    if ("error" in built) { toast.error(built.error); return null; }
    return built;
  }

  async function create() {
    const built = await compute();
    if (!built) return;
    const { data, error } = await supabase.from("cost_estimates")
      .insert({ job_id: jobId, version: (list[0]?.version ?? 0) + 1, tolerance: built.tolerance, notes: built.notes })
      .select("id").single();
    if (error) return toast.error(error.message);
    await saveEstimate(jobId, built, data.id);
    toast.success("Grobkosten aus der Begehung berechnet");
    setSel(data.id);
    refresh();
  }

  const [updating, setUpdating] = useState(false);
  async function update() {
    if (!cur) return;
    if (!confirm("Grobkosten aus der aktuellen Begehung neu berechnen? Manuell geänderte Beträge der Standard-Pakete werden überschrieben. Eigene Zusatzpositionen bleiben.")) return;
    setUpdating(true);
    try {
      const built = await compute();
      if (!built) return;
      await saveEstimate(jobId, built, cur.id);
      toast.success("Grobkosten aktualisiert");
      refresh();
    } finally {
      setUpdating(false);
    }
  }
  async function duplicate() {
    if (!cur) return;
    const { data, error } = await supabase.from("cost_estimates")
      .insert({ job_id: jobId, version: (list[0]?.version ?? 0) + 1, tolerance: cur.tolerance, confidence: cur.confidence, notes: cur.notes })
      .select("id").single();
    if (error) return toast.error(error.message);
    await supabase.from("cost_estimate_items").insert(cur.cost_estimate_items.map((it) => ({ estimate_id: data.id, section: it.section, description: it.description, amount: it.amount, sort_order: it.sort_order })));
    setSel(data.id);
    refresh();
    toast.success("Neue Version erstellt");
  }
  async function patch(v: { tolerance?: number; confidence?: string; visibility?: string }) {
    if (!cur) return;
    await supabase.from("cost_estimates").update(v).eq("id", cur.id);
    refresh();
  }
  async function remove() {
    if (!cur || !confirm(`Version ${cur.version} löschen?`)) return;
    await supabase.from("cost_estimates").delete().eq("id", cur.id);
    setSel(null);
    refresh();
  }

  if (!cur) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">Optional: schnelle, unverbindliche Kostenschätzung für den Kunden – vor der Offerte. Wird nach «Aufnahme auswerten» automatisch aus der Begehung berechnet.</p>
        <button onClick={create} className="h-12 w-full rounded-lg bg-primary font-semibold text-primary-foreground">Grobkostenschätzung erstellen</button>
      </div>
    );
  }

  const items = [...cur.cost_estimate_items].sort((a, b) => a.sort_order - b.sort_order);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const tol = Number(cur.tolerance);
  const rounded = roundTo(total);

  return (
    <div className="space-y-3">
      {list.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {list.map((e) => (
            <button key={e.id} onClick={() => setSel(e.id)} className={`h-9 shrink-0 rounded-full border px-3 text-sm font-medium ${e.id === cur.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              V{e.version} · {formatDate(e.created_at)}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border-2 border-primary bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geschätzte Kosten · V{cur.version}</div>
        <div className="font-mono text-3xl font-medium text-primary">{formatCHF(rounded)}</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orientierungsrahmen (±{tol}%)</div>
        <div className="font-mono text-lg">{formatCHF(roundTo(total * (1 - tol / 100)))} – {formatCHF(roundTo(total * (1 + tol / 100)))}</div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
        {cur.notes && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{cur.notes}</p>}
      </div>

      <button onClick={update} disabled={updating} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} /> Aus aktueller Begehung neu berechnen
      </button>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="field-label">Toleranz %</span>
          <Input key={cur.id + "t"} className="h-12 text-base" type="number" inputMode="decimal" defaultValue={tol} onBlur={(e) => patch({ tolerance: Number(e.target.value) || 0 })} />
        </label>
        <label className="space-y-1"><span className="field-label">Sicherheit</span>
          <select value={cur.confidence} onChange={(e) => patch({ confidence: e.target.value })} className="h-12 w-full rounded-md border border-input bg-card px-3 text-base">
            {CONFIDENCE.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["intern", "dem Kunden gezeigt"] as const).map((v) => (
          <button key={v} onClick={() => patch({ visibility: v })} className={`h-10 rounded-md text-sm font-semibold ${cur.visibility === v ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{v === "intern" ? "Intern" : "Dem Kunden gezeigt"}</button>
        ))}
      </div>

      <div className="divide-y rounded-xl border bg-card">
        {items.filter((it) => Number(it.amount) !== 0 || it.section === "Sonstiges" && it.description !== "Sonstiges").map((it) => <EstimateRow key={it.id} item={it} onChange={refresh} />)}
        <button onClick={async () => { await supabase.from("cost_estimate_items").insert({ estimate_id: cur.id, section: "Sonstiges", description: "Neue Position", sort_order: items.length }); refresh(); }}
          className="flex h-12 w-full items-center justify-center gap-1 text-sm font-semibold text-primary"><Plus className="h-4 w-4" /> Position hinzufügen</button>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 font-semibold">
        <span>Summe (exkl. MWST)</span><span className="font-mono">{formatCHF(total)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={duplicate} className="flex h-12 items-center justify-center gap-1 rounded-lg border font-semibold"><Copy className="h-4 w-4" /> Neue Version</button>
        <button onClick={remove} className="flex h-12 items-center justify-center gap-1 rounded-lg border font-semibold text-destructive"><Trash2 className="h-4 w-4" /> Version löschen</button>
      </div>
    </div>
  );
}

function EstimateRow({ item, onChange }: { item: { id: string; description: string; amount: number; details?: unknown }; onChange: () => void }) {
  const [d, setD] = useState(item.description);
  const [a, setA] = useState(String(item.amount));
  const [open, setOpen] = useState(false);
  useEffect(() => { setD(item.description); setA(String(item.amount)); }, [item.description, item.amount]);
  const lines = Array.isArray(item.details) ? (item.details as GuideLine[]) : [];
  async function save() {
    if (d === item.description && Number(a) === Number(item.amount)) return;
    await supabase.from("cost_estimate_items").update({ description: d, amount: Number(a) || 0 }).eq("id", item.id);
    onChange();
  }
  return (
    <div className="p-2">
      <div className="flex items-center gap-2">
        <button aria-label="Inhalt anzeigen" disabled={!lines.length} onClick={() => setOpen(!open)} className="flex h-11 w-8 items-center justify-center text-muted-foreground disabled:opacity-30">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <Input className="h-11 flex-1 text-base" value={d} onChange={(e) => setD(e.target.value)} onBlur={save} />
        <Input className="h-11 w-28 text-right font-mono text-base" type="number" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} onBlur={save} />
        <button aria-label="Entfernen" onClick={async () => { await supabase.from("cost_estimate_items").delete().eq("id", item.id); onChange(); }} className="flex h-11 w-10 items-center justify-center text-destructive"><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && lines.length > 0 && (
        <ul className="ml-10 mt-1 space-y-1 rounded-lg bg-muted p-2 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="text-muted-foreground">{l.label}</span><span className="shrink-0 font-mono">{formatCHF(l.amount)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
