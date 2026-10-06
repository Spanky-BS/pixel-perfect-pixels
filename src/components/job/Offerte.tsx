import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Pencil, Share2, Trash2 } from "lucide-react";
import { downloadFile, elementToPdf, shareOrDownload } from "@/lib/pdf";
import { SERVICE_REPORT_CSS } from "@/lib/service-report";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MaterialList } from "@/components/job/MaterialList";
import { useLabour } from "@/components/job/LabourList";
import { useMaterials } from "@/components/job/MaterialList";
import { Row } from "@/components/job/Kalkulation";
import { settingsQuery } from "@/lib/queries";
import {
  COMPANY,
} from "@/lib/company";
import {
  STANDARD_WORK_POSITIONS,
  address,
  customerName,
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

const seedingJobs = new Set<string>();

type JobWithCustomer = Job & { customers?: Customer | null };

export function OfferteWorkspace({
  job,
  jobId,
  onEditLabour,
  onEditMaterial,
  onViewSources,
  onConfirmed,
  onTouchOfferte,
}: {
  job: JobWithCustomer;
  jobId: string;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onViewSources: () => void;
  onConfirmed: () => void;
  onTouchOfferte: () => void;
}) {
  const locked = isOfferLocked(job.status);
  const [mode, setMode] = useState<"edit" | "preview">(locked ? "preview" : "edit");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Offerte</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {locked
            ? "Vom Kunden bestätigt – SOLL-Positionen bleiben unverändert."
            : "Bearbeiten bis der Kunde bestätigt. Danach startet die Ausführung."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([["edit", "Bearbeiten"], ["preview", "Vorschau"]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`h-11 rounded-lg text-sm font-medium ${mode === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "edit"
        ? (
          <OfferteEdit
            job={job}
            jobId={jobId}
            locked={locked}
            onEditLabour={onEditLabour}
            onEditMaterial={onEditMaterial}
            onViewSources={onViewSources}
            onConfirmed={onConfirmed}
            onTouchOfferte={onTouchOfferte}
          />
        )
        : <OffertePreview job={job} jobId={jobId} />}
    </div>
  );
}

function OfferteEdit({
  job,
  jobId,
  locked,
  onEditLabour,
  onEditMaterial,
  onViewSources,
  onConfirmed,
  onTouchOfferte,
}: {
  job: JobWithCustomer;
  jobId: string;
  locked: boolean;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onViewSources: () => void;
  onConfirmed: () => void;
  onTouchOfferte: () => void;
}) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const quoted = quotedLabour(labour.data);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const totals = computeQuote(labour.data, materials.data, vatRate, Number(settings.data?.default_material_markup ?? 0));

  useEffect(() => {
    if (labour.isLoading || quoted.length) return;
    void seedDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labour.isLoading, quoted.length]);

  async function seedDefaults() {
    if (locked || seedingJobs.has(jobId)) return;
    seedingJobs.add(jobId);
    try {
      const { data: existing } = await supabase.from("labour_items").select("description").eq("job_id", jobId);
      const have = new Set((existing ?? []).map((l) => l.description.trim().toLowerCase()));
      const missing = STANDARD_WORK_POSITIONS.filter((t) => !have.has(t.toLowerCase()));
      if (!missing.length) return;
      const rate = Number(settings.data?.default_hourly_rate ?? 120);
      const { error } = await supabase.from("labour_items").insert(
        missing.map((title, i) => ({
          job_id: jobId,
          description: title,
          hours: 0,
          hourly_rate: rate,
          notes: "",
          source: "manual",
          sort_order: i,
        })),
      );
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["labour", jobId] });
      onTouchOfferte();
    } finally {
      seedingJobs.delete(jobId);
    }
  }

  async function addMissingStandards() {
    const have = new Set(quoted.map((l) => l.description.trim().toLowerCase()));
    const missing = STANDARD_WORK_POSITIONS.filter((t) => !have.has(t.toLowerCase()));
    if (!missing.length) return toast.message("Standardpositionen sind bereits vorhanden");
    const rate = Number(settings.data?.default_hourly_rate ?? 120);
    const { error } = await supabase.from("labour_items").insert(
      missing.map((title, i) => ({
        job_id: jobId,
        description: title,
        hours: 0,
        hourly_rate: rate,
        notes: "",
        source: "manual",
        sort_order: Date.now() % 1e9 + i,
      })),
    );
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
    onTouchOfferte();
  }

  async function removeLabour(l: Labour) {
    if (!confirm("Position aus der Offerte entfernen?")) return;
    const { error } = await supabase.from("labour_items").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">Arbeiten</h3>
          {!locked && (
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary"
              onClick={() => onEditLabour({ job_id: jobId, hours: 1, hourly_rate: Number(settings.data?.default_hourly_rate ?? 120) })}
            >
              + Position
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border/80 bg-card">
          {!quoted.length && <p className="px-3 py-4 text-sm text-muted-foreground">Noch keine Arbeitspositionen.</p>}
          {quoted.map((l) => (
            <div key={l.id} className="border-b border-border/70 px-3 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => !locked && onEditLabour(l)}
                >
                  <p className="font-semibold">{l.description || "–"}</p>
                  {l.notes?.trim() && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{l.notes}</p>}
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {Number(l.hours) > 0
                      ? `${Number(l.hours).toLocaleString("de-CH")} h × ${formatCHF(Number(l.hourly_rate))}`
                      : "Stunden noch offen"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="font-mono text-sm font-medium">{formatCHF(labourQuoteAmount(l))}</span>
                  {!locked && (
                    <>
                      <button type="button" aria-label="Bearbeiten" className="flex h-10 w-10 items-center justify-center text-muted-foreground" onClick={() => onEditLabour(l)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Entfernen" className="flex h-10 w-10 items-center justify-center text-destructive" onClick={() => void removeLabour(l)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <button type="button" className="text-sm font-medium text-primary" onClick={() => void addMissingStandards()}>
            Standardpositionen ergänzen
          </button>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">Material</h3>
          {!locked && (
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary"
              onClick={() => onEditMaterial({ job_id: jobId, quantity: 1, unit: "Stk", status: "Offen" })}
            >
              + Material
            </button>
          )}
        </div>
        <Button variant="outline" className="h-11 w-full" onClick={onViewSources}>Unterlagen</Button>
        <MaterialList jobId={jobId} onEdit={locked ? () => {} : onEditMaterial} readOnly={locked} />
      </section>

      <section className={`rounded-lg border-2 bg-card p-4 ${totals.incomplete ? "border-warning" : "border-border"}`}>
        {totals.incomplete && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
            {totals.unpriced} Materialposition{totals.unpriced === 1 ? "" : "en"} ohne Preis
          </p>
        )}
        <Row label="Arbeit" value={formatCHF(totals.labourTotal)} />
        <Row label="Material" value={formatCHF(totals.materialTotal)} />
        <Row label={totals.incomplete ? "Zwischensumme (vorläufig)" : "Zwischensumme"} value={formatCHF(totals.subtotal)} />
        <Row label={`MWST ${vatRate}%`} value={formatCHF(totals.vat)} />
        <Row label={totals.incomplete ? "Total CHF (vorläufig)" : "Total CHF"} value={formatCHF(totals.total)} bold />
      </section>

      <button disabled className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-muted-foreground opacity-70">
        <FileText className="h-4 w-4" /> Offerte in Bexio erstellen (folgt)
      </button>

      {!locked && (
        <Button
          className="h-14 w-full text-base font-semibold"
          onClick={() => {
            if (!confirm("Offerte von Kunde bestätigt? Das Projekt wechselt in die Ausführung. Die Offertpositionen bleiben als SOLL erhalten.")) return;
            void onConfirmed();
          }}
        >
          Offerte von Kunde bestätigt
        </Button>
      )}
    </div>
  );
}

function OffertePreview({ job, jobId }: { job: JobWithCustomer; jobId: string }) {
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const markup = Number(settings.data?.default_material_markup ?? 0);
  const quoted = quotedLabour(labour.data);
  const totals = computeQuote(labour.data, materials.data, vatRate, markup);
  const company = settings.data?.company_name?.trim() || COMPANY.name;
  const c = job.customers;

  return (
    <div className="space-y-5 rounded-lg border border-border/80 bg-card p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Offerte</p>
        <p className="mt-1 text-lg font-semibold">{company}</p>
        <p className="text-sm text-muted-foreground">{COMPANY.street}, {COMPANY.zipCity}</p>
      </div>
      <dl className="border-y border-border/80">
        <PreviewRow label="Kunde" value={customerName(c)} />
        <PreviewRow label="Projekt" value={job.title} />
        <PreviewRow label="Adresse" value={address(job) || "–"} />
        <PreviewRow label="Datum" value={formatDate(new Date().toISOString())} />
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Arbeiten</h3>
        {quoted.map((l) => (
          <div key={l.id} className="border-b border-border/70 py-2 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{l.description || "–"}</p>
              <p className="shrink-0 font-mono text-sm">{formatCHF(labourQuoteAmount(l))}</p>
            </div>
            {l.notes?.trim() && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{l.notes}</p>}
            {Number(l.hours) > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">{Number(l.hours).toLocaleString("de-CH")} h × {formatCHF(Number(l.hourly_rate))}</p>
            )}
          </div>
        ))}
        {!quoted.length && <p className="text-sm text-muted-foreground">Keine Arbeitspositionen.</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Material</h3>
        {(materials.data ?? []).map((m) => {
          const p = linkedProduct(m as unknown as Parameters<typeof linkedProduct>[0]);
          const qty = Number(m.quantity);
          const vk = p ? unitSalesPrice(p, markup) : null;
          return (
            <div key={m.id} className="flex items-start justify-between gap-3 border-b border-border/70 py-2 last:border-b-0">
              <div className="min-w-0">
                <p className="font-medium">{p?.name || m.description || "–"}</p>
                <p className="text-xs text-muted-foreground">
                  {qty} {m.unit}
                  {p?.manufacturer_article_no ? ` · Herst. ${p.manufacturer_article_no}` : ""}
                  {p?.supplier_article_no ? ` · Art. ${p.supplier_article_no}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm">{vk != null ? formatCHF(vk * qty) : "–"}</p>
            </div>
          );
        })}
        {!materials.data?.length && <p className="text-sm text-muted-foreground">Kein Material.</p>}
      </div>

      <div className="border-t border-border/80 pt-2">
        <Row label="Zwischensumme" value={formatCHF(totals.subtotal)} />
        <Row label={`MWST ${vatRate}%`} value={formatCHF(totals.vat)} />
        <Row label="Total CHF" value={formatCHF(totals.total)} bold />
      </div>
      <OffertePdfActions job={job} quoted={quoted} materials={materials.data ?? []} markup={markup} vatRate={vatRate} totals={totals} company={company} />
    </div>
  );
}

function OffertePdfActions({
  job, quoted, materials, markup, vatRate, totals, company,
}: {
  job: JobWithCustomer;
  quoted: Labour[];
  materials: Material[];
  markup: number;
  vatRate: number;
  totals: ReturnType<typeof computeQuote>;
  company: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const c = job.customers;
  const today = formatDate(new Date().toISOString());
  const nr = `OF-${new Date(job.created_at).getFullYear()}-${job.id.slice(0, 6).toUpperCase()}`;
  const filename = `Offerte_${nr}_${(job.title || "Projekt").replace(/[^\w\-äöüÄÖÜ]+/g, "_")}`;
  const contact = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "";
  const custLines = c ? [c.company_name, contact, c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean) : ["–"];

  async function run(share: boolean) {
    if (!ref.current) return;
    setBusy(true);
    const t = toast.loading("PDF wird erstellt…");
    try {
      const file = await elementToPdf(ref.current, filename);
      if (share) {
        const r = await shareOrDownload(file, `Offerte ${nr}`);
        if (r === "downloaded") toast.success("PDF heruntergeladen", { id: t });
        else toast.dismiss(t);
      } else {
        downloadFile(file);
        toast.success("PDF gespeichert", { id: t });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {totals.incomplete && <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">{totals.unpriced} Material-Position(en) ohne Preis – im PDF als «–» aufgeführt.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12 font-semibold" disabled={busy} onClick={() => void run(false)}>
          <Download className="h-4 w-4" /> Offerte als PDF
        </Button>
        <Button variant="outline" className="h-12 font-semibold" disabled={busy} onClick={() => void run(true)}>
          <Share2 className="h-4 w-4" /> PDF teilen
        </Button>
      </div>
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
                <dt>Gültig:</dt><dd>30 Tage</dd>
              </dl>
            </div>
          </div>
          {quoted.length > 0 && (
            <section className="sr-sec">
              <h3>Arbeiten</h3>
              <table className="sr-table">
                <thead><tr><th>Beschreibung</th><th className="num">Stunden</th><th className="num">Ansatz</th><th className="num">Betrag</th></tr></thead>
                <tbody>
                  {quoted.map((l) => (
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
              <tr className="grand"><td>Totalbetrag:</td><td className="num">{formatCHF(totals.total)}</td></tr>
            </tbody></table>
          </div>
          <p style={{ marginTop: 14 }}>Wir danken für Ihre Anfrage und freuen uns auf Ihren Auftrag. Preise in CHF, inkl. MWST, gültig 30 Tage.</p>
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function QuoteTotalsCard({ jobId }: { jobId: string }) {
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const totals = computeQuote(labour.data, materials.data, vatRate, Number(settings.data?.default_material_markup ?? 0));
  return (
    <section className={`rounded-lg border-2 bg-card p-4 ${totals.incomplete ? "border-warning" : "border-border"}`}>
      <h3 className="mb-2 text-sm font-semibold">Offerte (SOLL)</h3>
      <Row label="Arbeit" value={`${totals.hours.toLocaleString("de-CH")} h · ${formatCHF(totals.labourTotal)}`} />
      <Row label="Material" value={formatCHF(totals.materialTotal)} />
      <Row label={`MWST ${vatRate}%`} value={formatCHF(totals.vat)} />
      <Row label="Total CHF" value={formatCHF(totals.total)} bold />
    </section>
  );
}
