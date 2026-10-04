import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { settingsQuery } from "@/lib/queries";
import { EXTRA_COST_KINDS, UNITS, formatCHF, formatDate, signedUrls, uploadMedia, type Job } from "@/lib/app";
import { Row } from "./Kalkulation";

type Table = "service_labour_entries" | "service_material_entries" | "service_additional_costs";
type AnyRow = Record<string, unknown> & { id?: string; job_id: string };

function useRows(table: Table, jobId: string) {
  return useQuery({
    queryKey: [table, jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data as unknown as AnyRow[];
    },
  });
}

async function saveRow(table: Table, row: AnyRow) {
  const { id, created_at, user_id, ...rest } = row;
  void created_at; void user_id;
  const q = id ? supabase.from(table).update(rest as never).eq("id", id as string) : supabase.from(table).insert(rest as never);
  const { error } = await q;
  if (error) throw error;
}

function useServiceTotals(jobId: string) {
  const lab = useRows("service_labour_entries", jobId);
  const mat = useRows("service_material_entries", jobId);
  const ext = useRows("service_additional_costs", jobId);
  const labour = (lab.data ?? []).reduce((s, r) => s + Number(r["hours"]) * Number(r["hourly_rate"]), 0);
  const material = (mat.data ?? []).reduce((s, r) => s + Number(r["quantity"]) * Number(r["sales_price"]), 0);
  const extras = (ext.data ?? []).reduce((s, r) => s + Number(r["quantity"]) * Number(r["price"]), 0);
  const hours = (lab.data ?? []).reduce((s, r) => s + Number(r["hours"]), 0);
  return { labour, material, extras, hours, lab, mat, ext };
}

const toLocalInput = (iso: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

// ---------- Labour (actual effort) ----------
export function ServiceLabour({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const { lab, labour, hours } = useServiceTotals(jobId);
  const [d, setD] = useState<AnyRow | null>(null);
  const rate = Number(settings.data?.service_hourly_rate ?? 120);
  const refresh = () => qc.invalidateQueries({ queryKey: ["service_labour_entries", jobId] });

  function setTime(k: "start_at" | "end_at", v: string) {
    if (!d) return;
    const next = { ...d, [k]: fromLocalInput(v) };
    const s = next["start_at"] as string | null, e = next["end_at"] as string | null;
    if (s && e && new Date(e) > new Date(s)) next["hours"] = Math.round(((new Date(e).getTime() - new Date(s).getTime()) / 3.6e6) * 4) / 4;
    setD(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button className="action-tile-primary" onClick={() => setD({ job_id: jobId, description: "Service Sanitär", hours: 1, hourly_rate: rate, start_at: new Date().toISOString() })}><Plus className="h-6 w-6" />Arbeit erfassen</button>
        <button className="action-tile" onClick={() => setD({ job_id: jobId, description: "Fahrtzeit", hours: 0.5, hourly_rate: Number(settings.data?.travel_rate ?? rate) })}><Plus className="h-6 w-6 text-primary" />Fahrtzeit</button>
      </div>
      {(lab.data ?? []).map((r) => (
        <ItemCard key={r.id} title={String(r["description"] || "–")} right={formatCHF(Number(r["hours"]) * Number(r["hourly_rate"]))}
          sub={[`${Number(r["hours"])} h × ${formatCHF(Number(r["hourly_rate"]))}`, r["technician"] as string, r["start_at"] ? formatDate(r["start_at"] as string, true) : null].filter(Boolean).join(" · ")}
          onEdit={() => setD(r)} onDelete={async () => { await supabase.from("service_labour_entries").delete().eq("id", r.id!); refresh(); }} />
      ))}
      {!lab.data?.length && <Empty text="Noch keine Arbeitszeit erfasst." />}
      <div className="rounded-lg bg-muted px-4 py-2"><Row label="Stunden total" value={`${hours} h`} /><Row label="Arbeit total" value={formatCHF(labour)} bold /></div>

      <EditSheet title="Arbeitszeit" row={d} onClose={() => setD(null)} onSave={async () => { await saveRow("service_labour_entries", d!); refresh(); setD(null); }}>
        {d && <>
          <Field label="Beschreibung"><Input className="h-12 text-base" value={String(d["description"] ?? "")} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input className="h-12 text-base" type="datetime-local" value={toLocalInput(d["start_at"])} onChange={(e) => setTime("start_at", e.target.value)} /></Field>
            <Field label="Ende"><Input className="h-12 text-base" type="datetime-local" value={toLocalInput(d["end_at"])} onChange={(e) => setTime("end_at", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stunden (h)"><Input className="h-12 text-base" type="number" inputMode="decimal" step="0.25" value={String(d["hours"] ?? 0)} onChange={(e) => setD({ ...d, hours: Number(e.target.value) })} /></Field>
            <Field label="Ansatz CHF/h"><Input className="h-12 text-base" type="number" inputMode="decimal" value={String(d["hourly_rate"] ?? 0)} onChange={(e) => setD({ ...d, hourly_rate: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Techniker"><Input className="h-12 text-base" value={String(d["technician"] ?? "")} onChange={(e) => setD({ ...d, technician: e.target.value })} /></Field>
          <div className="flex justify-between rounded-lg bg-muted px-4 py-3 font-semibold"><span>Total</span><span className="font-mono">{formatCHF(Number(d["hours"]) * Number(d["hourly_rate"]))}</span></div>
        </>}
      </EditSheet>
    </div>
  );
}

// ---------- Material used ----------
export function ServiceMaterial({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const { mat, material } = useServiceTotals(jobId);
  const [d, setD] = useState<AnyRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["service_material_entries", jobId] });
  const txt = (k: string, label: string, ph?: string) => d && (
    <Field label={label}><Input className="h-12 text-base" placeholder={ph} value={String(d[k] ?? "")} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Field>
  );
  const num = (k: string, label: string) => d && (
    <Field label={label}><Input className="h-12 text-base" type="number" inputMode="decimal" step="any" value={d[k] == null ? "" : String(d[k])} onChange={(e) => setD({ ...d, [k]: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
  );
  return (
    <div className="space-y-3">
      <button className="action-tile-primary w-full" onClick={() => setD({ job_id: jobId, quantity: 1, unit: "Stk", sales_price: 0 })}><Plus className="h-6 w-6" />Material erfassen</button>
      {(mat.data ?? []).map((r) => (
        <ItemCard key={r.id} title={String(r["description"] || "–")} right={formatCHF(Number(r["quantity"]) * Number(r["sales_price"]))}
          sub={[`${Number(r["quantity"])} ${r["unit"]} × ${formatCHF(Number(r["sales_price"]))}`, r["supplier"] as string, r["supplier_article_no"] as string].filter(Boolean).join(" · ")}
          onEdit={() => setD(r)} onDelete={async () => { await supabase.from("service_material_entries").delete().eq("id", r.id!); refresh(); }} />
      ))}
      {!mat.data?.length && <Empty text="Noch kein Material erfasst." />}
      <div className="rounded-lg bg-muted px-4 py-2"><Row label="Material total" value={formatCHF(material)} bold /></div>
      <EditSheet title="Material" row={d} onClose={() => setD(null)} onSave={async () => { await saveRow("service_material_entries", { ...d!, sales_price: Number(d!["sales_price"] ?? 0), quantity: Number(d!["quantity"] ?? 1) }); refresh(); setD(null); }}>
        {d && <>
          {txt("description", "Beschreibung", "z.B. Siphon 5/4\"")}
          <div className="grid grid-cols-2 gap-3">
            {num("quantity", "Menge")}
            <Field label="Einheit">
              <select className="h-12 w-full rounded-md border border-input bg-card px-3 text-base" value={String(d["unit"] ?? "Stk")} onChange={(e) => setD({ ...d, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">{num("purchase_price", "EK (optional)")}{num("sales_price", "VK CHF")}</div>
          <div className="grid grid-cols-2 gap-3">{txt("supplier", "Lieferant")}{txt("supplier_article_no", "Art.-Nr.")}</div>
          {txt("notes", "Notiz")}
        </>}
      </EditSheet>
    </div>
  );
}

// ---------- Additional costs ----------
export function ServiceExtras({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const { ext, extras } = useServiceTotals(jobId);
  const [d, setD] = useState<AnyRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["service_additional_costs", jobId] });
  const defaults: Record<string, number> = {
    Fahrzeugpauschale: Number(settings.data?.vehicle_fee ?? 0),
    Kleinmaterial: Number(settings.data?.small_material_allowance ?? 0),
  };
  return (
    <section className="space-y-2">
      <h2 className="section-title">Zusatzkosten</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {EXTRA_COST_KINDS.map((k) => (
          <button key={k} onClick={() => setD({ job_id: jobId, kind: k, description: k, quantity: 1, price: defaults[k] ?? 0 })} className="h-10 shrink-0 rounded-full border bg-card px-4 text-sm font-medium">+ {k}</button>
        ))}
      </div>
      {(ext.data ?? []).map((r) => (
        <ItemCard key={r.id} title={String(r["description"] || r["kind"])} right={formatCHF(Number(r["quantity"]) * Number(r["price"]))}
          sub={`${Number(r["quantity"])} × ${formatCHF(Number(r["price"]))}`}
          onEdit={() => setD(r)} onDelete={async () => { await supabase.from("service_additional_costs").delete().eq("id", r.id!); refresh(); }} />
      ))}
      {ext.data?.length ? <div className="rounded-lg bg-muted px-4 py-2"><Row label="Zusatzkosten total" value={formatCHF(extras)} bold /></div> : null}
      <EditSheet title="Zusatzkosten" row={d} onClose={() => setD(null)} onSave={async () => { await saveRow("service_additional_costs", d!); refresh(); setD(null); }}>
        {d && <>
          <Field label="Beschreibung"><Input className="h-12 text-base" value={String(d["description"] ?? "")} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Menge"><Input className="h-12 text-base" type="number" inputMode="decimal" value={String(d["quantity"] ?? 1)} onChange={(e) => setD({ ...d, quantity: Number(e.target.value) })} /></Field>
            <Field label="Preis CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" value={String(d["price"] ?? 0)} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} /></Field>
          </div>
        </>}
      </EditSheet>
    </section>
  );
}

// ---------- Auftrag (order capture) ----------
export function ServiceOrder({ job }: { job: Job }) {
  const qc = useQueryClient();
  const [d, setD] = useState({
    problem_description: job.problem_description ?? "", customer_request: job.customer_request ?? "", internal_notes: job.internal_notes ?? "", appointment_at: job.appointment_at,
  });
  async function save() {
    const { error } = await supabase.from("jobs").update(d).eq("id", job.id);
    if (error) return toast.error(error.message);
    toast.success("Gespeichert");
    qc.invalidateQueries({ queryKey: ["job", job.id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <Field label="Problembeschreibung"><Textarea className="min-h-24 text-base" value={d.problem_description} onChange={(e) => setD({ ...d, problem_description: e.target.value })} placeholder="z.B. WC-Spülung läuft nach" /></Field>
      <Field label="Kundenwunsch"><Textarea className="min-h-20 text-base" value={d.customer_request} onChange={(e) => setD({ ...d, customer_request: e.target.value })} /></Field>
      <Field label="Termin (optional)"><Input className="h-12 text-base" type="datetime-local" value={toLocalInput(d.appointment_at)} onChange={(e) => setD({ ...d, appointment_at: fromLocalInput(e.target.value) })} /></Field>
      <Field label="Interne Notizen"><Textarea className="min-h-20 text-base" value={d.internal_notes} onChange={(e) => setD({ ...d, internal_notes: e.target.value })} /></Field>
      <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
    </div>
  );
}

// ---------- Abschluss ----------
export function ServiceCompletion({ job, onStatus }: { job: Job; onStatus: (s: string) => void }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const t = useServiceTotals(job.id);
  const [notes, setNotes] = useState(job.completion_notes ?? "");
  const [sigOpen, setSigOpen] = useState(false);
  const sig = useQuery({
    queryKey: ["sig", job.signature_path],
    enabled: !!job.signature_path,
    queryFn: async () => (await signedUrls([job.signature_path!]))[job.signature_path!] ?? null,
  });
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const subtotal = t.labour + t.material + t.extras;
  const vat = Math.round(subtotal * vatRate) / 100;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job", job.id] }); qc.invalidateQueries({ queryKey: ["jobs"] }); };

  async function update(v: Partial<Job>) {
    const { error } = await supabase.from("jobs").update(v).eq("id", job.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function complete() {
    if (!job.work_confirmed) return toast.error("Bitte zuerst «Arbeit ausgeführt» bestätigen");
    await update({ completion_notes: notes, completed_at: new Date().toISOString() });
    onStatus("Erledigt");
    toast.success("Auftrag abgeschlossen");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <Row label={`Arbeit (${t.hours} h)`} value={formatCHF(t.labour)} />
        <Row label="Material" value={formatCHF(t.material)} />
        <Row label="Zusatzkosten" value={formatCHF(t.extras)} />
        <div className="mt-2 border-t pt-2">
          <Row label="Zwischensumme" value={formatCHF(subtotal)} />
          <Row label={`MWST ${vatRate}%`} value={formatCHF(vat)} />
          <Row label="Total CHF" value={formatCHF(subtotal + vat)} bold />
        </div>
      </section>
      <ServiceExtras jobId={job.id} />
      <Field label="Abschlussnotizen"><Textarea className="min-h-24 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (job.completion_notes ?? "") && update({ completion_notes: notes })} /></Field>

      <button onClick={() => update({ work_confirmed: !job.work_confirmed })}
        className={`flex h-14 w-full items-center gap-3 rounded-xl border px-4 text-left font-semibold ${job.work_confirmed ? "border-success bg-success/10 text-success" : "bg-card"}`}>
        <CheckCircle2 className="h-6 w-6" /> Arbeit ausgeführt {job.work_confirmed ? "– bestätigt" : "– bestätigen"}
      </button>

      <section className="space-y-2">
        <h2 className="section-title">Unterschrift Kunde (optional)</h2>
        {sig.data ? <img src={sig.data} alt="Unterschrift" className="h-32 w-full rounded-xl border bg-card object-contain" /> : null}
        <Button variant="outline" className="h-12 w-full" onClick={() => setSigOpen(true)}>{job.signature_path ? "Neu unterschreiben" : "Unterschrift erfassen"}</Button>
      </section>

      <Button className="h-14 w-full text-base font-semibold" onClick={complete}>Auftrag abschliessen</Button>
      <button disabled className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-muted-foreground opacity-70">
        <FileText className="h-4 w-4" /> Rechnung in Bexio erstellen (folgt)
      </button>
      {job.completed_at && <p className="text-center text-xs text-muted-foreground">Abgeschlossen am {formatDate(job.completed_at, true)}</p>}

      <Sheet open={sigOpen} onOpenChange={setSigOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Unterschrift</SheetTitle></SheetHeader>
          {sigOpen && <SignaturePad onSave={async (blob) => {
            try {
              const path = await uploadMedia(job.id, blob, "png");
              await update({ signature_path: path });
              setSigOpen(false);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Fehler"); }
          }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SignaturePad({ onSave }: { onSave: (b: Blob) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2; c.height = r.height * 2;
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f1f3a";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <div className="space-y-3 p-4 pt-0">
      <canvas ref={ref} className="h-48 w-full touch-none rounded-xl border bg-card"
        onPointerDown={(e) => { drawing.current = true; const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDirty(true); }}
        onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDirty(false); }}>Löschen</Button>
        <Button className="h-12 font-semibold" disabled={!dirty} onClick={() => ref.current!.toBlob((b) => b && onSave(b), "image/png")}>Speichern</Button>
      </div>
    </div>
  );
}

// ---------- shared bits ----------
function ItemCard({ title, sub, right, onEdit, onDelete }: { title: string; sub?: string; right: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card p-3">
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{title}</span><span className="shrink-0 font-mono text-sm">{right}</span></div>
        {sub && <div className="mt-0.5 truncate text-sm text-muted-foreground">{sub}</div>}
      </button>
      <button aria-label="Bearbeiten" onClick={onEdit} className="flex h-10 w-10 items-center justify-center rounded-lg border text-muted-foreground"><Pencil className="h-4 w-4" /></button>
      <button aria-label="Löschen" onClick={() => confirm("Position löschen?") && onDelete()} className="flex h-10 w-10 items-center justify-center rounded-lg border text-destructive"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function EditSheet({ title, row, onClose, onSave, children }: { title: string; row: AnyRow | null; onClose: () => void; onSave: () => Promise<void>; children: React.ReactNode }) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{row?.id ? `${title} bearbeiten` : `${title} hinzufügen`}</SheetTitle></SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          {children}
          <Button className="h-12 w-full font-semibold" onClick={() => onSave().catch((e) => toast.error(e instanceof Error ? e.message : "Fehler"))}>Speichern</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
