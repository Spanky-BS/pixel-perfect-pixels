import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Clock, Package, FileUp, CheckCircle2, Plus, Camera, Mic } from "lucide-react";
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
import { address, displayServiceStatus, formatCHF, formatDate, servicePhotoCategory, signedUrls, uploadMedia, type Customer, type Job } from "@/lib/app";
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
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {SECTIONS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSection(k)}
              className={`h-10 min-w-0 flex-1 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold ${section === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
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

          <section className="space-y-2">
            <h2 className="section-title">Manuell erfassen</h2>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold" onClick={() => setLabourStart("work")}>
                <Clock className="h-4 w-4 text-primary" /> Arbeitszeit erfassen
              </button>
              <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold" onClick={() => setMatStart(true)}>
                <Package className="h-4 w-4 text-primary" /> Material erfassen
              </button>
              <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold" onClick={() => setExtraStart("Sonstiges")}>
                <Plus className="h-4 w-4 text-primary" /> Zusatzkosten erfassen
              </button>
              <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold" onClick={() => setVehicleStart(true)}>
                Fahrzeugpauschale bearbeiten
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="section-title">Erfasste Positionen</h2>
            <ServiceLabour jobId={job.id} hideQuickActions startWith={labourStart} onStarted={() => setLabourStart(null)} />
            <ServiceMaterial jobId={job.id} hideQuickActions startWith={matStart} onStarted={() => setMatStart(false)} />
            <ServiceVehicleFee jobId={job.id} startEdit={vehicleStart} onStarted={() => setVehicleStart(false)} />
            <ServiceExtras jobId={job.id} hideQuickActions startWith={extraStart} onStarted={() => setExtraStart(null)} />
          </section>

          <section className="space-y-3">
            <h2 className="section-title">Dokumentation hinzufügen</h2>
            <div className="grid grid-cols-4 gap-1.5">
              <button type="button" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border bg-muted/40 text-[10px] font-medium text-muted-foreground" onClick={onCamera}>
                <Camera className="h-4 w-4" /> Foto
              </button>
              <button type="button" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border bg-muted/40 text-[10px] font-medium text-muted-foreground" onClick={onVoice}>
                <Mic className="h-4 w-4" /> Sprachnotiz
              </button>
              <button type="button" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border bg-muted/40 text-[10px] font-medium text-muted-foreground" onClick={onText}>
                <FileText className="h-4 w-4" /> Textnotiz
              </button>
              <button type="button" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border bg-muted/40 text-[10px] font-medium text-muted-foreground" onClick={onUpload}>
                <FileUp className="h-4 w-4" /> Datei
              </button>
            </div>
            <PhotoGallery jobId={job.id} variant="service" />
            <NotesList jobId={job.id} />
            <DocumentList jobId={job.id} />
          </section>
        </div>
      )}
      {section === "abrechnung" && <ServiceBilling job={job} />}
      {section === "abschluss" && <ServiceClose job={job} />}
    </>
  );
}

function ServiceAuftrag({ job }: { job: ServiceJob }) {
  const c = job.customers;
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h2 className="section-title">Auftrag</h2>
        {job.report_number && <p><span className="font-semibold">Rapportnummer: </span>{job.report_number}</p>}
        {job.problem_description && <p><span className="font-semibold">Problem: </span>{job.problem_description}</p>}
        {job.customer_request && <p><span className="font-semibold">Kundenwunsch: </span>{job.customer_request}</p>}
        {address(job) && <p className="text-muted-foreground">{address(job)}</p>}
        {c?.phone && <p><a className="font-medium text-primary" href={`tel:${c.phone}`}>{c.phone}</a></p>}
        {job.appointment_at && <p>Termin {formatDate(job.appointment_at, true)}</p>}
        {!job.problem_description && !job.customer_request && (
          <p className="text-muted-foreground">Noch kein Auftragstext – unten ergänzen.</p>
        )}
      </section>
      <ServiceOrder job={job} />
      <PhotoGallery jobId={job.id} variant="service" />
      <DocumentList jobId={job.id} />
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
