import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, FileUp, CheckCircle2, Camera, Mic, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { DocumentList, NotesList, PhotoGallery } from "@/components/job/CaptureSection";
import { ServiceAiCapture } from "@/components/job/ServiceAiCapture";
import {
  ServiceExtras,
  ServiceLabour,
  ServiceMaterial,
  ServiceOrder,
  ServiceVehicleFee,
  SignaturePad,
  useServiceTotals,
} from "@/components/job/ServiceSections";
import { Row } from "@/components/job/Kalkulation";
import { ServiceReportAction } from "@/components/job/ServiceReport";
import { address, customerName, displayServiceStatus, formatCHF, formatDate, servicePhotoCategory, signedUrls, uploadMedia, type Customer, type Job } from "@/lib/app";
import { isTravelLabour, serviceBill } from "@/lib/service-billing";
import { cancelJob } from "@/lib/lifecycle";
import { settingsQuery } from "@/lib/queries";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Section = "auftrag" | "erfassung" | "abrechnung" | "abschluss";
const SECTIONS: [Section, string][] = [
  ["auftrag", "Auftrag"],
  ["erfassung", "Erfassung"],
  ["abrechnung", "Abrechnung"],
  ["abschluss", "Abschluss"],
];

type ServiceJob = Job & { customers?: Customer | null };

export function ServiceJobView({
  job,
  onUpload,
  onCamera,
  onVoice,
  onText,
  onPhotoFiles,
}: {
  job: ServiceJob;
  onUpload: () => void;
  onCamera: () => void;
  onVoice: () => void;
  onText: () => void;
  onPhotoFiles: (files: FileList | File[] | null) => Promise<void> | void;
  onDeleted: () => void;
}) {
  const [section, setSection] = useState<Section>("auftrag");
  const [labourStart, setLabourStart] = useState<"work" | null>(null);
  const [matStart, setMatStart] = useState(false);
  const [extraStart, setExtraStart] = useState<string | null>(null);
  const [vehicleStart, setVehicleStart] = useState(false);

  return (
    <>
      <div className="sticky top-14 z-20 -mx-4 border-b border-border/80 bg-background px-4">
        <div className="grid grid-cols-4">
          {SECTIONS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSection(k)}
              className={`h-12 text-sm font-medium ${section === k ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {section === "auftrag" && <ServiceAuftrag job={job} />}
      {section === "erfassung" && (
        <div className="space-y-6">
          <ServiceAiCapture jobId={job.id} onPhotoFiles={onPhotoFiles} />

          <section className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug">Ausgeführte Arbeiten & Arbeitszeit</h2>
              <button type="button" className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary" onClick={() => setLabourStart("work")}>
                + Hinzufügen
              </button>
            </div>
            <div className="rounded-lg border border-border/80 bg-card px-3">
              <ServiceLabour jobId={job.id} hideQuickActions startWith={labourStart} onStarted={() => setLabourStart(null)} />
            </div>
          </section>

          <section className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Material</h2>
              <button type="button" className="inline-flex h-10 items-center text-sm font-medium text-primary" onClick={() => setMatStart(true)}>
                + Hinzufügen
              </button>
            </div>
            <div className="rounded-lg border border-border/80 bg-card px-3">
              <ServiceMaterial jobId={job.id} hideQuickActions startWith={matStart} onStarted={() => setMatStart(false)} />
            </div>
          </section>

          <section className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug">Fahrzeugpauschale / Zusatzkosten</h2>
              <button type="button" className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary" onClick={() => setExtraStart("Sonstiges")}>
                + Hinzufügen
              </button>
            </div>
            <div className="rounded-lg border border-border/80 bg-card px-3">
              <ServiceVehicleFee jobId={job.id} startEdit={vehicleStart} onStarted={() => setVehicleStart(false)} />
              <ServiceExtras jobId={job.id} hideQuickActions startWith={extraStart} onStarted={() => setExtraStart(null)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Fotos & Dokumentation</h2>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium" onClick={onCamera}>
                <Camera className="h-4 w-4" /> Foto
              </button>
              <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium" onClick={onUpload}>
                <FileUp className="h-4 w-4" /> Datei
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="flex h-11 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground" onClick={onVoice}>
                <Mic className="h-4 w-4" /> Sprachnotiz
              </button>
              <button type="button" className="flex h-11 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground" onClick={onText}>
                <FileText className="h-4 w-4" /> Textnotiz
              </button>
            </div>
            <PhotoGallery jobId={job.id} variant="service" hideEmpty />
            <NotesList jobId={job.id} hideEmpty />
            <DocumentList jobId={job.id} hideEmpty />
          </section>
        </div>
      )}
      {section === "abrechnung" && <ServiceBilling job={job} />}
      {section === "abschluss" && <ServiceClose job={job} />}
    </>
  );
}

function ServiceAuftrag({ job }: { job: ServiceJob }) {
  const [editing, setEditing] = useState(false);
  const c = job.customers;
  const person = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
  const wish = (job.customer_request || job.problem_description || "").trim();
  const showProblem = !!(
    job.problem_description?.trim() &&
    job.customer_request?.trim() &&
    job.customer_request.trim() !== job.problem_description.trim()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <h2 className="text-lg font-semibold">Auftrag</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Briefing vor dem Einsatz</p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 px-2 text-sm font-medium text-primary"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-4 w-4" /> Bearbeiten
        </button>
      </div>

      <section className="bg-card">
        <h3 className="px-0 pb-2 text-sm font-semibold text-muted-foreground">Auftragsinformationen</h3>
        <dl className="border-y border-border/80">
          <InfoRow label="Kunde">
            {c ? (
              <Link to="/kunden/$id" params={{ id: c.id }} className="font-medium text-primary">
                {customerName(c)}
              </Link>
            ) : (
              "Ohne Kunde"
            )}
          </InfoRow>
          <InfoRow label="Einsatzort">
            {address(job) ? (
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(address(job))}`} className="font-medium">
                {address(job)}
              </a>
            ) : (
              "–"
            )}
          </InfoRow>
          <InfoRow label="Kontakt">
            {c?.phone || (c?.company_name && person) ? (
              <span className="font-medium">
                {c?.company_name && person ? <span>{person}{c.phone ? " · " : ""}</span> : null}
                {c?.phone ? <a href={`tel:${c.phone}`} className="text-primary">{c.phone}</a> : null}
              </span>
            ) : (
              "–"
            )}
          </InfoRow>
          <InfoRow label="Termin">
            {job.appointment_at ? formatDate(job.appointment_at, true).replace(",", " ·") : "Noch nicht gesetzt"}
          </InfoRow>
          {job.report_number && <InfoRow label="Rapport">{job.report_number}</InfoRow>}
        </dl>

        <div className="space-y-1.5 py-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Kundenwunsch</h3>
          {wish ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{showProblem ? job.customer_request : wish}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Noch kein Kundenwunsch erfasst.</p>
          )}
          {showProblem && (
            <div className="space-y-1 pt-3">
              <h4 className="text-sm font-medium text-muted-foreground">Problem</h4>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{job.problem_description}</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border/80 py-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Interne Notiz</h3>
          {job.internal_notes?.trim() ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{job.internal_notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Keine interne Notiz.</p>
          )}
        </div>
      </section>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Auftrag bearbeiten</SheetTitle></SheetHeader>
          <div className="p-4 pt-0">
            <ServiceOrder key={job.updated_at} job={job} onSaved={() => setEditing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.75rem_1fr] items-baseline gap-x-3 border-b border-border/60 py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function ServiceBilling({ job }: { job: ServiceJob }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const t = useServiceTotals(job.id);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const b = serviceBill(t.lab.data ?? [], t.mat.data ?? [], t.ext.data ?? [], vatRate);
  const status = displayServiceStatus(job.status);

  async function markInvoiced() {
    if (!confirm("Als verrechnet markieren und ins Archiv verschieben?")) return;
    const { error } = await supabase.from("jobs").update({
      status: "Verrechnet",
      lifecycle_status: "completed",
      completed_at: job.completed_at ?? new Date().toISOString(),
    }).eq("id", job.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["job", job.id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    toast.success("Auftrag verrechnet – im Archiv");
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="section-title">Abrechnung</h2>
      <p className="text-sm text-muted-foreground">Aus den erfassten Regie-Positionen (Ist-Werte). Kundenrechnung in Bexio folgt.</p>
      <Row label={`Arbeit (${b.workHours} h)`} value={formatCHF(b.workCHF)} />
      <Row label="Material" value={formatCHF(b.materialCHF)} />
      <Row label="Fahrzeugpauschale" value={formatCHF(b.vehicleCHF)} />
      <Row label="Zusatzkosten" value={formatCHF(b.extrasCHF)} />
      <div className="border-t pt-2">
        <Row label="Zwischensumme" value={formatCHF(b.subtotal)} />
        <Row label={`MWST ${vatRate}%`} value={formatCHF(b.vat)} />
        <Row label="Total CHF" value={formatCHF(b.total)} bold />
      </div>
      <button disabled className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-muted-foreground opacity-70">
        <FileText className="h-4 w-4" /> Rechnung in Bexio erstellen
      </button>
      {(status === "Offen" || status === "Erledigt") && (
        <Button variant="outline" className="h-12 w-full font-semibold" onClick={() => void markInvoiced().catch((e) => toast.error(e instanceof Error ? e.message : "Fehler"))}>
          Als verrechnet markieren
        </Button>
      )}
    </section>
  );
}

function ServiceClose({ job }: { job: ServiceJob }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const t = useServiceTotals(job.id);
  const photos = useQuery({
    queryKey: ["photos", job.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_photos").select("category").eq("job_id", job.id);
      if (error) throw error;
      return data;
    },
  });
  const [notes, setNotes] = useState(job.completion_notes ?? "");
  const [sigOpen, setSigOpen] = useState(false);
  const sig = useQuery({
    queryKey: ["sig", job.signature_path],
    enabled: !!job.signature_path,
    queryFn: async () => (await signedUrls([job.signature_path!]))[job.signature_path!] ?? null,
  });
  const status = displayServiceStatus(job.status);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const b = serviceBill(t.lab.data ?? [], t.mat.data ?? [], t.ext.data ?? [], vatRate);
  const work = (t.lab.data ?? []).filter((r) => !isTravelLabour(r));
  const before = (photos.data ?? []).filter((p) => servicePhotoCategory(p.category) === "Vorher").length;
  const after = (photos.data ?? []).filter((p) => servicePhotoCategory(p.category) === "Nachher").length;
  const warnings = [
    !work.length ? "Keine Arbeitszeit erfasst" : null,
  ].filter(Boolean) as string[];

  async function patch(v: TablesUpdate<"jobs">) {
    const { error } = await supabase.from("jobs").update(v).eq("id", job.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["job", job.id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }

  async function markDone() {
    await patch({ status: "Erledigt", completion_notes: notes, lifecycle_status: "active", completed_at: new Date().toISOString() });
    toast.success("Auftrag erledigt – bleibt in den aktiven Aufträgen");
  }
  async function markCancelled() {
    if (!confirm("Auftrag absagen und ins Archiv verschieben?")) return;
    await cancelJob(job.id, null);
    await patch({ status: "Abgesagt" });
    toast.success("Auftrag abgesagt");
  }

  return (
    <div className="space-y-4">
      <Field label="Abschlussnotiz">
        <Textarea className="min-h-24 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (job.completion_notes ?? "") && patch({ completion_notes: notes })} />
      </Field>
      <section className="space-y-3">
        <h2 className="section-title">Dokumentation</h2>
        {!before && <p className="text-sm text-muted-foreground">Keine Vorher-Fotos vorhanden</p>}
        {before > 0 && <PhotoGallery jobId={job.id} variant="service" filterCategories={["Vorher"]} title="Vorher-Fotos" />}
        {!after && <p className="text-sm text-muted-foreground">Keine Nachher-Fotos vorhanden</p>}
        {after > 0 && <PhotoGallery jobId={job.id} variant="service" filterCategories={["Nachher"]} title="Nachher-Fotos" />}
      </section>
      {job.report_number && (
        <section className="rounded-xl border bg-card p-4 text-sm">
          <p><span className="font-semibold">Rapportnummer: </span>{job.report_number}</p>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="section-title">Unterschrift Kunde (optional)</h2>
        {sig.data ? <img src={sig.data} alt="Unterschrift" className="h-32 w-full rounded-xl border bg-card object-contain" /> : null}
        <Button variant="outline" className="h-12 w-full" onClick={() => setSigOpen(true)}>{job.signature_path ? "Neu unterschreiben" : "Unterschrift erfassen"}</Button>
      </section>
      <ServiceReportAction job={job} />
      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}
      <section className="rounded-xl border bg-card p-4">
        <Row label="Zu verrechnen" value={formatCHF(b.total)} bold />
      </section>
      {status === "Offen" && (
        <Button className="h-14 w-full text-base font-semibold" onClick={() => void markDone().catch((e) => toast.error(e instanceof Error ? e.message : "Fehler"))}>
          <CheckCircle2 className="h-5 w-5" /> Auftrag erledigt
        </Button>
      )}
      {status !== "Abgesagt" && status !== "Verrechnet" && (
        <button type="button" className="h-12 w-full rounded-lg border text-sm font-semibold text-destructive" onClick={() => void markCancelled().catch((e) => toast.error(e instanceof Error ? e.message : "Fehler"))}>
          Auftrag absagen
        </button>
      )}
      <Sheet open={sigOpen} onOpenChange={setSigOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Unterschrift</SheetTitle></SheetHeader>
          {sigOpen && (
            <SignaturePad
              onSave={async (blob) => {
                try {
                  const path = await uploadMedia(job.id, blob, "png");
                  await patch({ signature_path: path });
                  setSigOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler");
                }
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
