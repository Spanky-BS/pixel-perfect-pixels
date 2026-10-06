import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Trash2 } from "lucide-react";
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
          const p = linkedProduct(m as { products?: Parameters<typeof linkedProduct>[0]["products"] });
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
      <p className="text-xs text-muted-foreground">Vorschau – Versand nach Bexio folgt.</p>
    </div>
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
