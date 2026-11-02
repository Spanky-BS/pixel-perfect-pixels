import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, Mail, Plus, Tag, XCircle } from "lucide-react";
import { elementToPdf, downloadFile } from "@/lib/pdf";
import { greeting, sendPdfByMail, signature } from "@/lib/mail";
import { SERVICE_REPORT_CSS } from "@/lib/service-report";
import { supabase } from "@/integrations/supabase/client";
import { useLabour } from "@/components/job/LabourList";
import { useMaterials } from "@/components/job/MaterialList";
import { ProductSearch } from "@/components/job/ProductSearch";
import { Row } from "@/components/job/Kalkulation";
import { settingsQuery } from "@/lib/queries";
import { COMPANY } from "@/lib/company";
import {
  STANDARD_WORK_POSITIONS,
  address,
  defaultTechnician,
  formatCHF,
  formatDate,
  isOfferLocked,
  type Customer,
  type Job,
  type Labour,
  type Material,
} from "@/lib/app";
import { computeQuote, labourQuoteAmount, linkedProduct, quotedLabour } from "@/lib/project-quote";
import { unitSalesPrice } from "@/lib/products";
import { round5 } from "@/lib/customer-invoice";

const seedingJobs = new Set<string>();

type JobWithCustomer = Job & { customers?: (Pick<Customer, "id" | "company_name" | "first_name" | "last_name"> & Partial<Customer>) | null | undefined };

export function offerNumber(job: Pick<Job, "id" | "created_at">) {
  return `OF-${new Date(job.created_at).getFullYear()}-${job.id.slice(0, 6).toUpperCase()}`;
}

export function OfferteWorkspace({
  job,
  jobId,
  onEditLabour,
  onEditMaterial,
  onViewSources,
  onConfirmed,
  onDeclined,
  onTouchOfferte,
}: {
  job: JobWithCustomer;
  jobId: string;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onViewSources: () => void;
  onConfirmed: () => void;
  onDeclined: () => void;
  onTouchOfferte: () => void;
}) {
  const qc = useQueryClient();
  const locked = isOfferLocked(job.status);
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const [productFor, setProductFor] = useState<Material | null>(null);
  const sent = useQuery({
    queryKey: ["quotations", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotations").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const quoted = quotedLabour(labour.data);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const markup = Number(settings.data?.default_material_markup ?? 0);
  const validDays = Number(settings.data?.offer_valid_days ?? 30);
  const totals = computeQuote(labour.data, materials.data, vatRate, markup);
  const openHours = quoted.filter((l) => !(Number(l.hours) > 0)).length;
  const lastSent = (sent.data ?? []).find((q) => q.status === "Versendet");
  const rate = Number(settings.data?.default_hourly_rate ?? 120);

  useEffect(() => {
    if (labour.isLoading || quoted.length || locked) return;
    void seedDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labour.isLoading, quoted.length]);

  async function seedDefaults() {
    if (seedingJobs.has(jobId)) return;
    seedingJobs.add(jobId);
    try {
      const { data: existing } = await supabase.from("labour_items").select("description").eq("job_id", jobId);
      const have = new Set((existing ?? []).map((l) => l.description.trim().toLowerCase()));
      const missing = STANDARD_WORK_POSITIONS.filter((t) => !have.has(t.toLowerCase()));
      if (!missing.length) return;
      const { error } = await supabase.from("labour_items").insert(
        missing.map((title, i) => ({ job_id: jobId, description: title, hours: 0, hourly_rate: rate, notes: "", source: "manual", sort_order: i })),
      );
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["labour", jobId] });
      onTouchOfferte();
    } finally {
      seedingJobs.delete(jobId);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <section className="overflow-hidden rounded-xl bg-primary text-primary-foreground" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}>
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">Offerte · inkl. MWST</span>
            <span className="text-[11px] font-medium opacity-70 tabular">{offerNumber(job)}</span>
          </div>
          <div className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular">{formatCHF(round5(totals.total))}</div>
          <div className="mt-2 text-sm opacity-80 tabular">Netto {formatCHF(totals.subtotal)} · MWST {vatRate}% {formatCHF(totals.vat)}</div>
        </div>
        <div className="flex items-center justify-between border-t border-primary-foreground/15 px-5 py-2.5 text-sm">
          <span className="opacity-80">{locked ? "Vom Kunden bestätigt" : `Gültig ${validDays} Tage`}</span>
          <span className="opacity-80">{lastSent ? `Versendet ${formatDate(lastSent.created_at)}` : "Noch nicht versendet"}</span>
        </div>
      </section>

      {(totals.unpriced > 0 || openHours > 0) && !locked && (
        <div className="flex gap-2.5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5">
            {totals.unpriced > 0 && <p>{totals.unpriced} Material ohne Preis – «Produkt wählen» antippen.</p>}
            {openHours > 0 && <p>{openHours} Arbeit{openHours === 1 ? "" : "en"} ohne Stunden.</p>}
          </div>
        </div>
      )}

      <OfferRubrics
        jobId={jobId}
        rows={rows}
        texts={texts}
        locked={locked}
        rate={rate}
        onEditLabour={onEditLabour}
        onEditMaterial={onEditMaterial}
        onPickProduct={setProductFor}
      />
      {!locked && (
        <button type="button" onClick={onViewSources} className="h-11 w-full rounded-xl border border-border bg-card text-sm font-medium text-primary">Unterlagen der Begehung ansehen</button>
      )}

      <ExclusionsSection jobId={jobId} list={exclusions} locked={locked} />

      <section className="surface flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Preise im PDF</div>
          <div className="text-xs text-muted-foreground">{itemized ? "Einzelpreise pro Position sichtbar" : "Kunde sieht nur das Total pro Rubrik"}</div>
        </div>
        <div className="flex shrink-0 rounded-lg border border-border p-0.5 text-sm">
          {(["rubric", "itemized"] as const).map((m) => (
            <button key={m} disabled={locked} onClick={async () => { await supabase.from("jobs").update({ offer_pricing_mode: m }).eq("id", jobId); qc.invalidateQueries({ queryKey: ["job", jobId] }); }}
              className={`h-9 rounded-md px-3 ${job.offer_pricing_mode === m || (m === "rubric" && !itemized) ? "bg-primary text-primary-foreground" : ""}`}>
              {m === "rubric" ? "Pauschal" : "Einzeln"}
            </button>
          ))}
        </div>
      </section>

      <OffertePdfActions
        job={job}
        rows={rows}
        texts={texts}
        exclusions={exclusions}
        itemized={itemized}
        vatRate={vatRate}
        validDays={validDays}
        totals={totals}
        settings={settings.data}
        onSent={async () => {
          await supabase.from("quotations").insert({ job_id: jobId, status: "Versendet", total: round5(totals.total) });
          qc.invalidateQueries({ queryKey: ["quotations", jobId] });
        }}
      />

      {!locked && (
        <section className="surface space-y-3 p-4">
          <div>
            <h3 className="text-[15px] font-semibold">Kundenentscheid</h3>
            <p className="text-xs text-muted-foreground">Bei Zusage startet die Ausführung. Die Offerte bleibt als SOLL erhalten.</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => { if (confirm("Offerte vom Kunden bestätigt? Das Projekt wechselt in die Ausführung.")) onConfirmed(); }}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
            ><CheckCircle2 className="h-5 w-5" /> Kunde hat bestätigt</button>
            <button onClick={onDeclined} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-destructive">
              <XCircle className="h-4 w-4" /> Abgesagt
            </button>
          </div>
        </section>
      )}

      {productFor && (
        <ProductSearch open materialId={productFor.id} jobId={jobId} hint={productFor.description} onClose={() => setProductFor(null)} />
      )}
    </div>
  );
}

type SettingsRow = { company_name?: string | null; default_technician?: string | null; technician_phone?: string | null } | null | undefined;

function OffertePdfActions({
  job, quoted, materials, markup, vatRate, validDays, totals, settings, onSent,
}: {
  job: JobWithCustomer;
  quoted: Labour[];
  materials: Material[];
  markup: number;
  vatRate: number;
  validDays: number;
  totals: ReturnType<typeof computeQuote>;
  settings: SettingsRow;
  onSent: () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const company = settings?.company_name?.trim() || COMPANY.name;
  const c = job.customers;
  const today = formatDate(new Date().toISOString());
  const nr = offerNumber(job);
  const filename = `Offerte_${nr}_${(job.title || "Projekt").replace(/[^\w\-äöüÄÖÜ]+/g, "_")}`;
  const contact = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "";
  const custLines = c ? [c.company_name, contact, c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean) : ["–"];
  const printed = quoted.filter((l) => labourQuoteAmount(l) > 0);

  async function run(mode: "download" | "mail") {
    if (!ref.current) return;
    setBusy(true);
    const t = toast.loading("PDF wird erstellt…");
    try {
      const file = await elementToPdf(ref.current, filename);
      toast.dismiss(t);
      if (mode === "download") {
        downloadFile(file);
        toast.success("PDF gespeichert");
        return;
      }
      const ok = await sendPdfByMail(file, {
        to: c?.email,
        subject: `Offerte ${nr} – ${job.title}`,
        body: `${greeting(c)}\n\nIm Anhang erhalten Sie unsere Offerte ${nr} für «${job.title}».\nDie Offerte ist ${validDays} Tage gültig. Für Fragen stehe ich Ihnen gerne zur Verfügung.\n\n${signature({ technician: defaultTechnician(settings), company, phone: settings?.technician_phone || COMPANY.phone })}`,
      });
      if (ok) await onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => void run("download")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium disabled:opacity-60" style={{ boxShadow: "var(--shadow-card)" }}>
          <Download className="h-4 w-4 text-primary" /> PDF herunterladen
        </button>
        <button disabled={busy} onClick={() => void run("mail")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium disabled:opacity-60" style={{ boxShadow: "var(--shadow-card)" }}>
          <Mail className="h-4 w-4 text-primary" /> Per E-Mail senden
        </button>
      </div>
      {totals.unpriced > 0 && <p className="px-1 text-xs text-muted-foreground">Material ohne Preis erscheint im PDF mit «–».</p>}
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
          <h1 className="sr-title">Offerte</h1>
          <p className="sr-sub">{job.title}</p>
          <div className="sr-grid">
            <div className="sr-box">
              <h3>Kunde</h3>
              <p style={{ margin: 0 }}>{custLines.map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            </div>
            <div className="sr-box">
              <h3>Offerte</h3>
              <dl>
                <dt>Offertnummer:</dt><dd>{nr}</dd>
                <dt>Datum:</dt><dd>{today}</dd>
                <dt>Objekt:</dt><dd>{address(job) || "–"}</dd>
                <dt>Gültig:</dt><dd>{validDays} Tage</dd>
              </dl>
            </div>
          </div>
          {printed.length > 0 && (
            <section className="sr-sec">
              <h3>Arbeiten</h3>
              <table className="sr-table">
                <thead><tr><th>Beschreibung</th><th className="num">Stunden</th><th className="num">Ansatz</th><th className="num">Betrag</th></tr></thead>
                <tbody>
                  {printed.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description || "–"}{l.notes?.trim() ? <><br /><small>{l.notes}</small></> : null}</td>
                      <td className="num">{Number(l.hours).toLocaleString("de-CH")}</td>
                      <td className="num">{formatCHF(Number(l.hourly_rate))}</td>
                      <td className="num">{formatCHF(labourQuoteAmount(l))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total Arbeit:</td><td className="num">{formatCHF(totals.labourTotal)}</td></tr></tfoot>
              </table>
            </section>
          )}
          {materials.length > 0 && (
            <section className="sr-sec">
              <h3>Material</h3>
              <table className="sr-table">
                <thead><tr><th>Artikel</th><th className="num">Menge</th><th className="num">Preis</th><th className="num">Betrag</th></tr></thead>
                <tbody>
                  {materials.map((m) => {
                    const p = linkedProduct(m as unknown as Parameters<typeof linkedProduct>[0]);
                    const qty = Number(m.quantity);
                    const vk = p ? unitSalesPrice(p, markup) : null;
                    return (
                      <tr key={m.id}>
                        <td>{p?.name || m.description || "–"}</td>
                        <td className="num">{qty.toLocaleString("de-CH")} {m.unit}</td>
                        <td className="num">{vk != null ? formatCHF(vk) : "–"}</td>
                        <td className="num">{vk != null ? formatCHF(vk * qty) : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total Material:</td><td className="num">{formatCHF(totals.materialTotal)}</td></tr></tfoot>
              </table>
            </section>
          )}
          <div className="sr-tot">
            <h3>Zusammenfassung</h3>
            <table><tbody>
              <tr><td>Zwischensumme netto:</td><td className="num">{formatCHF(totals.subtotal)}</td></tr>
              <tr><td>MWST {vatRate}%:</td><td className="num">{formatCHF(totals.vat)}</td></tr>
              <tr className="grand"><td>Totalbetrag inkl. MWST:</td><td className="num">{formatCHF(round5(totals.total))}</td></tr>
            </tbody></table>
          </div>
          <p style={{ marginTop: 14 }}>Wir danken für Ihre Anfrage und freuen uns auf Ihren Auftrag. Preise in CHF. Verrechnet wird nach effektivem Aufwand. Die Offerte ist {validDays} Tage gültig.</p>
          <div className="sr-sig">
            <div><div className="sr-sig-empty" /><div className="sr-line">Ort / Datum / Unterschrift Kunde</div></div>
            <div><div className="sr-sig-empty" /><div className="sr-line">{company}</div></div>
          </div>
          <footer className="sr-foot"><span>{company}</span><span>{nr}</span></footer>
        </div>
      </div>
    </>
  );
}

export function QuoteTotalsCard({ jobId }: { jobId: string }) {
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const totals = computeQuote(labour.data, materials.data, vatRate, Number(settings.data?.default_material_markup ?? 0));
  return (
    <section className="surface p-4">
      <h3 className="mb-2 text-sm font-semibold">Offerte (SOLL)</h3>
      <Row label="Arbeit" value={`${totals.hours.toLocaleString("de-CH")} h · ${formatCHF(totals.labourTotal)}`} />
      <Row label="Material" value={formatCHF(totals.materialTotal)} />
      <Row label={`MWST ${vatRate}%`} value={formatCHF(totals.vat)} />
      <Row label="Total CHF" value={formatCHF(totals.total)} bold />
    </section>
  );
}

