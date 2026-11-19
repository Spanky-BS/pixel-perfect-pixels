import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Download, Mail, Pencil, Plus, Receipt, RefreshCw, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SwissQRBill } from "swissqrbill/svg";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/CustomerForm";
import { useLabour } from "@/components/job/LabourList";
import { useMaterials } from "@/components/job/MaterialList";
import { useTimeEntries } from "@/components/job/Ausfuehrung";
import { offerNumber } from "@/components/job/Offerte";
import { settingsQuery } from "@/lib/queries";
import { COMPANY } from "@/lib/company";
import { PROJECT_STEPS, address, customerName, defaultTechnician, formatCHF, normalizeStatus, type Customer, type Job } from "@/lib/app";
import { computeQuote } from "@/lib/project-quote";
import { groupByRubric } from "@/lib/rubrics";
import { SERVICE_REPORT_CSS } from "@/lib/service-report";
import { appendQrBillPage, downloadFile, elementToPdf } from "@/lib/pdf";
import { greeting, sendPdfByMail, signature } from "@/lib/mail";
import {
  INVOICE_KIND_LABEL, addDays, formatISODate, ibanStatus, invoiceLinesFromActuals, invoiceTotals,
  nextInvoiceNumber, qrBillData, round2, sumLines, todayISO, type InvoiceLine,
} from "@/lib/customer-invoice";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["customer_invoices"]["Row"];
type JobWithCustomer = Job & { customers?: Partial<Customer> | null };

export function useCustomerInvoices(jobId: string) {
  return useQuery({
    queryKey: ["customer_invoices", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_invoices").select("*").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data as Invoice[];
    },
  });
}

async function newNumber() {
  const { data } = await supabase.from("customer_invoices").select("number");
  return nextInvoiceNumber((data ?? []).map((r) => r.number), new Date().getFullYear());
}

export function RechnungWorkspace({ job }: { job: JobWithCustomer }) {
  const jobId = job.id;
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const times = useTimeEntries(jobId);
  const invoices = useCustomerInvoices(jobId);
  const [akontoOpen, setAkontoOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [condOpen, setCondOpen] = useState(false);

  const s = settings.data;
  const vatRate = Number(s?.vat_rate ?? 8.1);
  const markup = Number(s?.default_material_markup ?? 0);
  const payDays = Number(s?.invoice_payment_days ?? 30);
  const iban = ibanStatus(s?.iban);
  const actual = invoiceLinesFromActuals({
    labour: labour.data ?? [],
    times: times.data ?? [],
    materials: (materials.data ?? []) as never,
    defaultRate: Number(s?.default_hourly_rate ?? 120),
    markup,
    discountPercent: Number(job.offer_discount_percent ?? 0),
  });
  const list = invoices.data ?? [];
  const akontos = list.filter((i) => i.kind === "akonto" && i.status !== "storniert");
  const akontoSum = round2(akontos.reduce((sum, i) => sum + Number(i.total), 0));
  const schluss = list.find((i) => i.kind === "schluss" && i.status !== "storniert");
  const preview = invoiceTotals(sumLines(actual.lines), vatRate, akontoSum);
  const quote = computeQuote(labour.data, materials.data as never, vatRate, markup, Number(job.offer_discount_percent ?? 0));
  const offerNet = round2(quote.subtotal);
  const changes = round2(preview.net - offerNet - actual.extraNet);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer_invoices", jobId] });
    qc.invalidateQueries({ queryKey: ["job", jobId] });
  };

  async function moveToRechnung() {
    const cur = PROJECT_STEPS.indexOf(normalizeStatus(job.job_type, job.status) as (typeof PROJECT_STEPS)[number]);
    if (cur >= 0 && cur < PROJECT_STEPS.indexOf("Rechnung")) {
      await supabase.from("jobs").update({ status: "Rechnung" }).eq("id", jobId);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    }
  }

  const amounts = {
    lines: actual.lines as never,
    net: preview.net,
    vat_rate: vatRate,
    vat: preview.vat,
    total: preview.total,
    akonto_deducted: preview.akontoDeducted,
    amount_due: preview.amountDue,
    rubric_texts: (job.offer_rubric_texts ?? {}) as never,
  };

  async function saveSchluss(cond: Conditions) {
    if (schluss) {
      const { error } = await supabase.from("customer_invoices").update(cond).eq("id", schluss.id);
      if (error) return toast.error(error.message);
      toast.success("Konditionen gespeichert");
      setCondOpen(false);
      return refresh();
    }
    if (!actual.lines.length) return toast.error("Noch keine Stunden oder kein Material erfasst");
    if (actual.unpriced && !confirm(`${actual.unpriced} Material ohne Preis wird nicht verrechnet. Trotzdem erstellen?`)) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("customer_invoices").insert({
        job_id: jobId,
        kind: "schluss",
        number: await newNumber(),
        ...cond,
        title: job.title,
        rubric_texts: amounts.rubric_texts,
        lines: actual.lines,
        net: preview.net,
        vat_rate: vatRate,
        vat: preview.vat,
        total: preview.total,
        akonto_deducted: preview.akontoDeducted,
        amount_due: preview.amountDue,
      });
      if (error) return toast.error(error.message);
      await moveToRechnung();
      toast.success("Schlussrechnung erstellt");
      setCondOpen(false);
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function recalc() {
    if (!schluss) return;
    if (!confirm("Schlussrechnung mit den aktuellen Zahlen aus Offerte und Ausführung neu berechnen?")) return;
    const { error } = await supabase.from("customer_invoices").update(amounts).eq("id", schluss.id);
    if (error) return toast.error(error.message);
    toast.success("Schlussrechnung aktualisiert");
    refresh();
  }
  const outdated = !!schluss && (Math.abs(Number(schluss.amount_due) - preview.amountDue) >= 0.01 || JSON.stringify(schluss.rubric_texts ?? {}) !== JSON.stringify(job.offer_rubric_texts ?? {}));

  return (
    <div className="space-y-4 pb-4">
      <section className="overflow-hidden rounded-xl bg-primary text-primary-foreground" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}>
        <div className="p-5 pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Offerte + Nachverrechnung · inkl. MWST</div>
          <div className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular">{formatCHF(preview.total)}</div>
          <div className="mt-2 text-sm opacity-80 tabular">Netto {formatCHF(preview.net)} · MWST {vatRate}% {formatCHF(preview.vat)}</div>
        </div>
        {akontoSum > 0 && (
          <div className="flex items-center justify-between border-t border-primary-foreground/15 px-5 py-2.5 text-sm tabular">
            <span className="opacity-80">− Akonto {formatCHF(akontoSum)}</span>
            <span className="font-semibold">Rest {formatCHF(preview.amountDue)}</span>
          </div>
        )}
      </section>

      {(iban !== "ok" || actual.unpriced > 0) && (
        <div className="flex gap-2.5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5">
            {iban === "missing" && <p>Für den QR-Einzahlungsschein fehlt die IBAN. <Link to="/einstellungen" className="font-medium text-primary">In Einstellungen erfassen</Link></p>}
            {iban === "invalid" && <p>Die IBAN in den Einstellungen ist ungültig. <Link to="/einstellungen" className="font-medium text-primary">Prüfen</Link></p>}
            {actual.unpriced > 0 && <p>{actual.unpriced} Material ohne Preis – wird nicht verrechnet.</p>}
          </div>
        </div>
      )}

      <section className="list-group">
        <SumRow label="Bestätigte Offerte" hint={quote.discountTotal > 0 ? `inkl. Rabatt ${formatCHF(quote.discountTotal)}` : undefined} value={offerNet} />
        {Math.abs(changes) >= 0.01 && <SumRow label="Mengenänderungen Material" hint="Ist-Mengen aus der Ausführung" value={changes} />}
        <SumRow label="Nachverrechnung aus Ausführung" hint="Zusatzarbeit & Zusatzmaterial" value={actual.extraNet} />
        <SumRow label={`MWST ${vatRate}%`} value={preview.vat} />
        {akontoSum > 0 && <SumRow label="Bereits verrechnete Akontos" value={-akontoSum} />}
        <div className="flex min-h-12 items-center justify-between px-4 py-3">
          <span className="text-[15px] font-semibold">Rechnungsbetrag</span>
          <span className="text-[17px] font-semibold tabular">{formatCHF(preview.amountDue)}</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="section-title px-1">Rechnungen</h2>
        <div className="list-group">
          {!list.length && <p className="px-4 py-4 text-sm text-muted-foreground">Noch keine Rechnung erstellt.</p>}
          {list.map((inv) => <InvoiceRow key={inv.id} inv={inv} job={job} onChange={refresh} />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAkontoOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium" style={{ boxShadow: "var(--shadow-card)" }}>
            <Plus className="h-4 w-4 text-primary" /> Akontorechnung
          </button>
          <button
            onClick={() => setCondOpen(true)}
            disabled={creating || (!schluss && !actual.lines.length)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {schluss ? <><Pencil className="h-4 w-4" /> Konditionen</> : <><Receipt className="h-4 w-4" /> Schlussrechnung</>}
          </button>
        </div>
        {outdated && schluss?.status !== "bezahlt" && (
          <button onClick={() => void recalc()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-warning/60 bg-warning/10 text-sm font-medium">
            <RefreshCw className="h-4 w-4" /> Zahlen geändert – Schlussrechnung neu berechnen
          </button>
        )}
      </section>

      <ConditionsSheet
        open={condOpen}
        onClose={() => setCondOpen(false)}
        job={job}
        invoice={schluss ?? null}
        defaultDays={payDays}
        busy={creating}
        onSave={(c) => void saveSchluss(c)}
      />
      <AkontoSheet open={akontoOpen} onClose={() => setAkontoOpen(false)} job={job} count={akontos.length} onCreated={async () => { await moveToRechnung(); refresh(); }} />
    </div>
  );
}

function SumRow({ label, hint, value }: { label: string; hint?: string | undefined; value: number }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <span className="shrink-0 text-[15px] font-medium tabular">{formatCHF(value)}</span>
    </div>
  );
}

type Conditions = { invoice_date: string; due_date: string; billing_address: string | null; terms_text: string | null };

function customerAddressText(c: Partial<Customer> | null | undefined) {
  if (!c) return "";
  return [c.company_name, [c.first_name, c.last_name].filter(Boolean).join(" "), c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function ConditionsSheet({ open, onClose, job, invoice, defaultDays, busy, onSave }: {
  open: boolean; onClose: () => void; job: JobWithCustomer; invoice: Invoice | null; defaultDays: number; busy: boolean; onSave: (c: Conditions) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [days, setDays] = useState(String(defaultDays));
  const [other, setOther] = useState(false);
  const [addr, setAddr] = useState("");
  const [terms, setTerms] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDate(invoice?.invoice_date ?? todayISO());
      setDays(String(invoice ? daysBetween(invoice.invoice_date, invoice.due_date) : defaultDays));
      setOther(!!invoice?.billing_address);
      setAddr(invoice?.billing_address ?? customerAddressText(job.customers));
      setTerms(invoice?.terms_text ?? "");
    }
  }
  const d = Math.max(0, Number(days) || 0);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{invoice ? `Schlussrechnung ${invoice.number}` : "Schlussrechnung erstellen"}</SheetTitle></SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <Field label="Rechnungsdatum">
            <Input className="h-12 text-base" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Zahlungsfrist">
            <div className="flex flex-wrap gap-1.5">
              {[10, 14, 30, 60].map((n) => (
                <button key={n} type="button" onClick={() => setDays(String(n))} className={`h-10 rounded-full border px-4 text-sm ${d === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50"}`}>
                  {n} Tage
                </button>
              ))}
              <Input className="h-10 w-24 text-base tabular" type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Tage" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Zahlbar bis {formatISODate(addDays(date, d))}</p>
          </Field>
          <Field label="Rechnungsadresse">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => { setOther(false); setAddr(customerAddressText(job.customers)); }} className={`h-10 rounded-lg border text-sm ${!other ? "border-primary bg-primary/10 font-medium text-primary" : "border-border"}`}>Wie Kunde</button>
              <button type="button" onClick={() => setOther(true)} className={`h-10 rounded-lg border text-sm ${other ? "border-primary bg-primary/10 font-medium text-primary" : "border-border"}`}>Abweichend</button>
            </div>
            {other ? (
              <Textarea className="mt-2 min-h-28 text-base" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={"z.B. Verwaltung Muster AG\nz.H. Frau Meier\nHauptstrasse 1\n4051 Basel"} />
            ) : (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm">{customerAddressText(job.customers) || "Kein Kunde hinterlegt"}</p>
            )}
          </Field>
          <Field label="Bemerkung / Konditionen (optional)">
            <Textarea className="min-h-20 text-base" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="z.B. Zahlbar netto ohne Abzug. Bei Zahlung innert 10 Tagen 2% Skonto." />
          </Field>
          <button
            disabled={busy || !date}
            onClick={() => onSave({ invoice_date: date, due_date: addDays(date, d), billing_address: other && addr.trim() ? addr.trim() : null, terms_text: terms.trim() || null })}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {invoice ? "Speichern" : "Schlussrechnung erstellen"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AkontoSheet({ open, onClose, job, count, onCreated }: { open: boolean; onClose: () => void; job: JobWithCustomer; count: number; onCreated: () => Promise<void> }) {
  const settings = useQuery(settingsQuery());
  const labour = useLabour(job.id);
  const materials = useMaterials(job.id);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const days = Number(settings.data?.akonto_payment_days ?? 14);
  const offer = computeQuote(labour.data, materials.data, vatRate, Number(settings.data?.default_material_markup ?? 0), Number(job.offer_discount_percent));
  const net = Number(amount) || 0;
  const t = invoiceTotals(net, vatRate);

  async function create() {
    if (!(net > 0)) return toast.error("Betrag eingeben");
    setBusy(true);
    try {
      const date = todayISO();
      const nr = count + 1;
      const line: InvoiceLine = { kind: "akonto", description: `Akontozahlung ${nr} gemäss Offerte ${offerNumber(job)}`, qty: 1, unit: "", price: t.net, amount: t.net };
      const { error } = await supabase.from("customer_invoices").insert({
        job_id: job.id, kind: "akonto", number: await newNumber(), invoice_date: date, due_date: addDays(date, days),
        title: `Akontozahlung ${nr} – ${job.title}`, lines: [line], net: t.net, vat_rate: vatRate, vat: t.vat, total: t.total, amount_due: t.total,
      });
      if (error) return toast.error(error.message);
      toast.success("Akontorechnung erstellt");
      setAmount("");
      await onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader><SheetTitle>Akontorechnung</SheetTitle></SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <p className="text-sm text-muted-foreground">Zahlbar innert {days} Tagen. Wird in der Schlussrechnung abgezogen.</p>
          {offer.subtotal > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[30, 40, 50].map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(round2((offer.subtotal * p) / 100)))} className="h-9 rounded-full border border-border bg-muted/50 px-3 text-sm">
                  {p}% der Offerte
                </button>
              ))}
            </div>
          )}
          <Field label="Betrag netto CHF">
            <Input className="h-12 text-base tabular" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="z.B. 5000" />
          </Field>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm tabular">
            <div className="flex justify-between"><span className="text-muted-foreground">MWST {vatRate}%</span><span>{formatCHF(t.vat)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCHF(t.total)}</span></div>
          </div>
          <button disabled={busy || !(net > 0)} onClick={() => void create()} className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
            Akontorechnung erstellen
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InvoiceRow({ inv, job, onChange }: { inv: Invoice; job: JobWithCustomer; onChange: () => void }) {
  const settings = useQuery(settingsQuery());
  const ref = useRef<HTMLDivElement>(null);
  const [render, setRender] = useState(false);
  const [busy, setBusy] = useState(false);
  const paid = inv.status === "bezahlt";
  const s = settings.data;
  const company = s?.company_name?.trim() || COMPANY.name;
  const c = job.customers;
  const filename = `Rechnung_${inv.number}`;

  async function makePdf() {
    flushSync(() => setRender(true));
    if (!ref.current) throw new Error("PDF nicht bereit");
    const okIban = ibanStatus(s?.iban) === "ok";
    return elementToPdf(ref.current, filename, okIban ? async (pdf) => {
      const svg = new SwissQRBill(qrBillData({
        iban: s!.iban!, companyName: company, amount: Number(inv.amount_due), number: inv.number,
        debtor: c ? { name: customerName(c as Customer), street: c.street, zip: c.zip, city: c.city } : null,
      }), { language: "DE" }).toString();
      await appendQrBillPage(pdf, svg, `Zahlteil · ${INVOICE_KIND_LABEL[inv.kind as "akonto" | "schluss"]} ${inv.number}`);
    } : undefined);
  }

  async function run(mode: "download" | "mail") {
    setBusy(true);
    const t = toast.loading("PDF wird erstellt…");
    try {
      const file = await makePdf();
      toast.dismiss(t);
      if (mode === "download") { downloadFile(file); toast.success("PDF gespeichert"); return; }
      const ok = await sendPdfByMail(file, {
        to: c?.email,
        subject: `${INVOICE_KIND_LABEL[inv.kind as "akonto" | "schluss"]} ${inv.number} – ${job.title}`,
        body: `${greeting(c)}\n\nIm Anhang erhalten Sie unsere ${INVOICE_KIND_LABEL[inv.kind as "akonto" | "schluss"]} ${inv.number} über ${formatCHF(Number(inv.amount_due))}, zahlbar bis ${formatISODate(inv.due_date)}.\nDer QR-Einzahlungsschein befindet sich auf der letzten Seite.\n\nVielen Dank für Ihren Auftrag.\n\n${signature({ technician: defaultTechnician(s), company, phone: s?.technician_phone || COMPANY.phone })}`,
      });
      if (ok) { await supabase.from("customer_invoices").update({ sent_at: new Date().toISOString() }).eq("id", inv.id); onChange(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  async function togglePaid() {
    await supabase.from("customer_invoices").update(paid ? { status: "offen", paid_at: null } : { status: "bezahlt", paid_at: new Date().toISOString() }).eq("id", inv.id);
    onChange();
  }
  async function remove() {
    if (!confirm(`${INVOICE_KIND_LABEL[inv.kind as "akonto" | "schluss"]} ${inv.number} löschen?`)) return;
    await supabase.from("customer_invoices").delete().eq("id", inv.id);
    onChange();
  }

  const lines = (inv.lines as unknown as InvoiceLine[]) ?? [];
  const offerLines = lines.filter((l) => (l.kind === "arbeit" || l.kind === "material") && !l.extra);
  const extraLines = lines.filter((l) => (l.kind === "arbeit" || l.kind === "material") && l.extra);
  const akontoLines = lines.filter((l) => l.kind === "akonto");
  const rabatt = sumLines(lines.filter((l) => l.kind === "rabatt"));
  const texts = (inv.rubric_texts ?? {}) as Record<string, string>;
  const custLines = inv.billing_address ? inv.billing_address.split("\n") : c ? [c.company_name, [c.first_name, c.last_name].filter(Boolean).join(" "), c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean) : ["–"];
  const payDaysInv = daysBetween(inv.invoice_date, inv.due_date);
  const label = INVOICE_KIND_LABEL[inv.kind as "akonto" | "schluss"];

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => void togglePaid()} aria-label={paid ? "Als offen markieren" : "Als bezahlt markieren"} className="-ml-1 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
          {paid ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">{label} <span className="text-muted-foreground tabular">{inv.number}</span></div>
          <div className="text-xs text-muted-foreground tabular">
            {formatISODate(inv.invoice_date)} · {paid ? "bezahlt" : `fällig ${formatISODate(inv.due_date)}`}{inv.sent_at ? " · versendet" : ""}
          </div>
        </div>
        <span className="shrink-0 text-[15px] font-semibold tabular">{formatCHF(Number(inv.amount_due))}</span>
      </div>
      <div className="mt-2 flex gap-1.5 pl-8">
        <button disabled={busy} onClick={() => void run("download")} className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium disabled:opacity-50"><Download className="h-4 w-4 text-primary" />PDF</button>
        <button disabled={busy} onClick={() => void run("mail")} className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium disabled:opacity-50"><Mail className="h-4 w-4 text-primary" />E-Mail</button>
        <button onClick={() => void remove()} aria-label="Löschen" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
      </div>

      {render && (
        <div aria-hidden style={{ position: "fixed", left: "-10000px", top: 0, width: "190mm" }}>
          <style>{SERVICE_REPORT_CSS}</style>
          <div ref={ref} className="sr-page" style={{ background: "#fff", padding: "0" }}>
            <header className="sr-header">
              <img className="sr-logo" src={COMPANY.logoUrl} alt={company} />
              <div className="sr-co">
                <strong>{company}</strong>
                {COMPANY.street}, {COMPANY.zipCity}<br />
                {COMPANY.phone}<br />
                {COMPANY.email}<br />
                {COMPANY.website}
              </div>
            </header>
            <h1 className="sr-title">{label}</h1>
            <p className="sr-sub">{job.title}</p>
            <div className="sr-grid">
              <div className="sr-box">
                <h3>Rechnungsadresse</h3>
                <p style={{ margin: 0 }}>{custLines.map((l, i) => <span key={i}>{l}<br /></span>)}</p>
              </div>
              <div className="sr-box">
                <h3>Rechnung</h3>
                <dl>
                  <dt>Rechnungsnr.:</dt><dd>{inv.number}</dd>
                  <dt>Datum:</dt><dd>{formatISODate(inv.invoice_date)}</dd>
                  <dt>Zahlbar bis:</dt><dd>{formatISODate(inv.due_date)}</dd>
                  <dt>Objekt:</dt><dd>{address(job) || "–"}</dd>
                  <dt>Offerte:</dt><dd>{offerNumber(job)}</dd>
                </dl>
              </div>
            </div>
            <RubricInvoiceTables lines={offerLines} texts={texts} />
            <InvoiceTable title="Nachverrechnung Ausführung" qtyLabel="Menge" lines={extraLines} />
            <InvoiceTable title="Leistung" qtyLabel="" lines={akontoLines} />
            <div className="sr-tot">
              <h3>Zusammenfassung</h3>
              <table><tbody>
                {rabatt !== 0 && <tr><td>Offerte vor Rabatt:</td><td className="num">{formatCHF(sumLines(offerLines))}</td></tr>}
                {rabatt !== 0 && <tr><td>Rabatt:</td><td className="num">−{formatCHF(-rabatt)}</td></tr>}
                {extraLines.length > 0 && <tr><td>Nachverrechnung:</td><td className="num">{formatCHF(sumLines(extraLines))}</td></tr>}
                <tr><td>Total netto:</td><td className="num">{formatCHF(Number(inv.net))}</td></tr>
                <tr><td>MWST {Number(inv.vat_rate)}%:</td><td className="num">{formatCHF(Number(inv.vat))}</td></tr>
                <tr><td>Total inkl. MWST:</td><td className="num">{formatCHF(Number(inv.total))}</td></tr>
                {Number(inv.akonto_deducted) > 0 && <tr><td>abzüglich Akontozahlungen:</td><td className="num">− {formatCHF(Number(inv.akonto_deducted))}</td></tr>}
                <tr className="grand"><td>Zu bezahlen:</td><td className="num">{formatCHF(Number(inv.amount_due))}</td></tr>
              </tbody></table>
            </div>
            <p style={{ marginTop: 14 }}>
              {inv.terms_text && <>{inv.terms_text}<br /></>}
              Zahlbar innert {payDaysInv} Tagen bis {formatISODate(inv.due_date)}.
              {ibanStatus(s?.iban) === "ok" ? " Der QR-Einzahlungsschein befindet sich auf der letzten Seite." : ""} Vielen Dank für Ihren Auftrag.
            </p>
            <footer className="sr-foot"><span>{company}</span><span>{inv.number}</span></footer>
          </div>
        </div>
      )}
    </div>
  );
}

function RubricInvoiceTables({ lines, texts }: { lines: InvoiceLine[]; texts: Record<string, string> }) {
  const groups = groupByRubric(lines, (l) => l.amount);
  return (
    <>
      {groups.map((g) => {
        const single = g.rubrics.length === 1 && g.rubrics[0]!.rubric.code === g.group;
        return (
          <section key={g.group} className="of-group">
            <h2 className="of-group-h"><span>{g.group}</span>{g.title}</h2>
            {g.rubrics.map((rg) => {
              const text = texts[rg.rubric.code]?.trim();
              return (
                <div key={rg.rubric.code} className="of-rub">
                  {!single && <h3 className="of-rub-h"><span>{rg.rubric.code}</span>{rg.rubric.title}</h3>}
                  {text ? <p className="of-text">{text}</p> : rg.items.map((l, i) => (
                    <table key={i} className="sr-table of-items"><tbody><tr>
                      <td>{l.description || "–"}</td>
                      <td className="num">{l.kind === "arbeit" ? "" : `${l.qty.toLocaleString("de-CH")} ${l.unit}`}</td>
                    </tr></tbody></table>
                  ))}
                  <div className="of-sum"><span>Total {rg.rubric.code} {rg.rubric.title}</span><span>{formatCHF(rg.total)}</span></div>
                </div>
              );
            })}
            {!single && <div className="of-gsum"><span>Total {g.group} {g.title}</span><span>{formatCHF(g.total)}</span></div>}
          </section>
        );
      })}
    </>
  );
}

function InvoiceTable({ title, qtyLabel, lines }: { title: string; qtyLabel: string; lines: InvoiceLine[] }) {
  if (!lines.length) return null;
  const total = sumLines(lines);
  return (
    <section className="sr-sec">
      <h3>{title}</h3>
      <table className="sr-table">
        <thead><tr><th>Beschreibung</th><th className="num">{qtyLabel}</th><th className="num">Ansatz</th><th className="num">Betrag</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{l.unit ? `${l.qty.toLocaleString("de-CH")} ${l.unit === "h" ? "" : l.unit}` : ""}</td>
              <td className="num">{formatCHF(l.price)}</td>
              <td className="num">{formatCHF(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total {title}:</td><td className="num">{formatCHF(total)}</td></tr></tfoot>
      </table>
    </section>
  );
}
