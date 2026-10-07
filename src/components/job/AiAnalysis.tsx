import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, Plus, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { analyzeJob } from "@/lib/ai.functions";
import { categoriesQuery, settingsQuery } from "@/lib/queries";

type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Prefix of the text note that stores an answer to an open question (picked up by the next AI run). */
export const answerPrefix = (question: string) => `Antwort zu «${question}»: `;

/**
 * Runs the AI on all not-yet-analysed captures and applies the result directly:
 * material + labour go into the job, unclear points become open questions.
 */
export function useAnalyzeAndApply(jobId: string) {
  const qc = useQueryClient();
  const run = useServerFn(analyzeJob);
  const cats = useQuery(categoriesQuery());
  const settings = useQuery(settingsQuery());
  const [busy, setBusy] = useState(false);

  /** true = new data applied, false = nothing new, null = failed */
  async function analyze(): Promise<boolean | null> {
    setBusy(true);
    try {
      const r = await run({ data: { jobId } });
      if (r.nothingNew) {
        toast.message("Keine neuen Aufnahmen oder Antworten – nichts Neues auszuwerten.");
        return false;
      }
      const { data: rows } = await supabase.from("ai_suggestions").select("*").eq("job_id", jobId).eq("state", "pending");
      const catId = (name: unknown) => cats.data?.find((c) => c.name.toLowerCase() === String(name ?? "").toLowerCase())?.id ?? null;
      const rate = Number(settings.data?.default_hourly_rate ?? 120);
      const mats = (rows ?? []).filter((x) => x.kind === "material").map((x, i) => {
        const p = (x.payload ?? {}) as P;
        return {
          job_id: jobId, category_id: catId(p["kategorie"]), description: s(p["beschreibung"]) ?? "", quantity: n(p["menge"], 1), unit: s(p["einheit"]) ?? "Stk",
          preferred_brand: s(p["marke"]), dimensions: s(p["dimension"]), finish: s(p["ausfuehrung"]), notes: s(p["notiz"]), status: "Offen", source: "ai", sort_order: (Date.now() % 1e9) + i,
        };
      }).filter((m) => m.description);
      const labs = (rows ?? []).filter((x) => x.kind === "labour").map((x, i) => {
        const p = (x.payload ?? {}) as P;
        return { job_id: jobId, description: s(p["beschreibung"]) ?? "", hours: n(p["stunden"], 1), hourly_rate: rate, notes: s(p["notiz"]), source: "ai", sort_order: (Date.now() % 1e9) + i };
      }).filter((l) => l.description);
      const opens = (rows ?? []).filter((x) => x.kind === "open").map((x) => ({ job_id: jobId, text: String(((x.payload ?? {}) as P)["text"] ?? ""), source: "ai" })).filter((o) => o.text);
      const results = await Promise.all([
        mats.length ? supabase.from("material_requirements").insert(mats) : null,
        labs.length ? supabase.from("labour_items").insert(labs) : null,
        opens.length ? supabase.from("open_questions").insert(opens) : null,
      ]);
      const err = results.find((x) => x?.error)?.error;
      if (err) throw new Error(err.message);
      if (rows?.length) await supabase.from("ai_suggestions").update({ state: "accepted" }).in("id", rows.map((x) => x.id));
      toast.success(`${mats.length} Material · ${labs.length} Arbeit · ${opens.length} offene Fragen`);
      if (r.skippedDocuments?.length) toast.message(`Nicht automatisch ausgewertet: ${r.skippedDocuments.join(", ")}`);
      ["materials", "labour", "open", "ai"].forEach((k) => qc.invalidateQueries({ queryKey: [k, jobId] }));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auswertung fehlgeschlagen");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { analyze, busy };
}

export function OpenQuestions({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const q = useQuery({
    queryKey: ["open", jobId],
    queryFn: async () => {
      const [{ data, error }, { data: notes }] = await Promise.all([
        supabase.from("open_questions").select("*").eq("job_id", jobId).order("created_at"),
        supabase.from("voice_notes").select("transcript").eq("job_id", jobId).eq("kind", "text").like("transcript", "Antwort zu «%"),
      ]);
      if (error) throw error;
      return (data ?? []).map((o) => {
        const pre = answerPrefix(o.text);
        const note = [...(notes ?? [])].reverse().find((x) => x.transcript?.startsWith(pre));
        return { ...o, answer: note?.transcript?.slice(pre.length) ?? null };
      });
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["open", jobId] });
  async function setStatus(id: string, status: string) {
    await supabase.from("open_questions").update({ status }).eq("id", id);
    refresh();
  }
  async function answer(o: { id: string; text: string }, a: string) {
    if (!a.trim()) return;
    const { error } = await supabase.from("voice_notes").insert({ job_id: jobId, kind: "text", transcript: answerPrefix(o.text) + a.trim() });
    if (error) return toast.error(error.message);
    await setStatus(o.id, "geklärt");
    qc.invalidateQueries({ queryKey: ["notes", jobId] });
    toast.success("Antwort gespeichert – fliesst bei der nächsten KI-Auswertung ein");
  }
  async function add() {
    if (!text.trim()) return;
    await supabase.from("open_questions").insert({ job_id: jobId, text: text.trim() });
    setText("");
    refresh();
  }
  const list = q.data ?? [];
  const open = list.filter((o) => o.status === "offen");
  const done = list.filter((o) => o.status !== "offen");
  if (!list.length) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-warning/40 bg-warning/[0.08] p-4">
      <h2 className="text-base font-semibold">Offene Fragen {open.length > 0 && <span className="ml-1 rounded bg-warning/30 px-1.5 text-sm">{open.length}</span>}</h2>
      <p className="text-xs text-muted-foreground">Antwort eintippen, damit die KI die Schätzung verbessert – oder abhaken / verwerfen.</p>
      {open.map((o) => <OpenRow key={o.id} q={o} onAnswer={(a) => answer(o, a)} onStatus={(st) => setStatus(o.id, st)} />)}
      {done.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{done.length} erledigt</summary>
          <div className="mt-2 space-y-1.5">
            {done.map((o) => (
              <div key={o.id} className="flex items-start justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className={o.status === "nicht relevant" ? "text-muted-foreground line-through" : ""}>{o.text}</div>
                  {o.answer && <div className="font-medium text-primary">→ {o.answer}</div>}
                </div>
                <button aria-label="Wieder öffnen" onClick={() => setStatus(o.id, "offen")} className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"><RotateCcw className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="flex gap-2 pt-1">
        <Input className="h-11 bg-card text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Eigene Frage hinzufügen" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} aria-label="Hinzufügen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></button>
      </div>
    </section>
  );
}

function OpenRow({ q, onAnswer, onStatus }: { q: { text: string }; onAnswer: (a: string) => void; onStatus: (s: string) => void }) {
  const [a, setA] = useState("");
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="font-medium">{q.text}</div>
      <div className="flex gap-2">
        <Input className="h-11 text-base" value={a} onChange={(e) => setA(e.target.value)} placeholder="Antwort, z.B. Rohr 16 mm" onKeyDown={(e) => e.key === "Enter" && onAnswer(a)} />
        <button disabled={!a.trim()} onClick={() => onAnswer(a)} className="h-11 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">Speichern</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onStatus("geklärt")} className="flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-semibold"><Check className="h-4 w-4" />Abhaken</button>
        <button onClick={() => onStatus("nicht relevant")} className="flex h-10 items-center justify-center gap-1 rounded-lg border text-sm font-semibold text-muted-foreground"><X className="h-4 w-4" />Verwerfen</button>
      </div>
    </div>
  );
}

