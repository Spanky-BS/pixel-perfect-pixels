import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Mic, FileText, Package, Wrench, MapPin, Phone, Trash2, ChevronLeft, MoreHorizontal, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { DocumentList, NotesList, PhotoAssignSheet, PhotoGallery, SourceFilesSheet, classifyUpload, useCaptureSheets, useDocumentUpload, useFileInputs, usePhotoUpload } from "@/components/job/CaptureSection";
import { MaterialEditor, MaterialList, useMaterials } from "@/components/job/MaterialList";
import { LabourEditor, LabourList, useLabour } from "@/components/job/LabourList";
import { settingsQuery } from "@/lib/queries";
import { StatusStepper } from "@/components/job/StatusStepper";
import { AiAnalysis, OpenQuestions } from "@/components/job/AiAnalysis";
import { CostEstimate } from "@/components/job/CostEstimate";
import { Row } from "@/components/job/Kalkulation";
import { Nachkalkulation } from "@/components/job/Nachkalkulation";
import { SupplierInvoices } from "@/components/job/SupplierInvoices";
import { ServiceJobView } from "@/components/job/ServiceJob";
import { OfferteWorkspace, QuoteTotalsCard } from "@/components/job/Offerte";
import { AusfuehrungWorkspace } from "@/components/job/Ausfuehrung";
import { DEFAULT_SERVICE_PHOTO_CATEGORY, JOB_TYPE_LABEL, PROJECT_STEPS, address, customerName, displayServiceStatus, formatDate, normalizeStatus, type Job, type Labour, type Material } from "@/lib/app";
import { computeQuote } from "@/lib/project-quote";
import { StatusBadge } from "@/components/Brand";
import { cancelJob, completeJob, isActiveJob, lifecycleLabel, lifecycleOf } from "@/lib/lifecycle";
import { unitSalesPrice } from "@/lib/products";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/baustellen/$id")({
  head: () => ({
    meta: [
      { title: "Auftrag – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Baustelle mit Fotos, Notizen, Material und Arbeitsleistungen." },
      { property: "og:title", content: "Auftrag – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Baustelle mit Fotos, Notizen, Material und Arbeitsleistungen." },
    ],
  }),
  component: JobPage,
});

function JobPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState<string | null>(null);
  const [mat, setMat] = useState<(Partial<Material> & { job_id: string }) | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [assignPhotoIds, setAssignPhotoIds] = useState<string[]>([]);
  const [lab, setLab] = useState<(Partial<Labour> & { job_id: string }) | null>(null);
  const settings = useQuery(settingsQuery());

  const job = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*, customers(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const jobTypeRef = useRef(job.data?.job_type);
  jobTypeRef.current = job.data?.job_type;

  const viewStepRef = useRef(selectedWorkflowStep);
  viewStepRef.current = selectedWorkflowStep;
  const persistedRef = useRef<string | null>(null);
  persistedRef.current = job.data ? normalizeStatus(job.data.job_type, job.data.status) : null;
  const photos = usePhotoUpload(id, {
    defaultCategory: job.data?.job_type === "service" ? DEFAULT_SERVICE_PHOTO_CATEGORY : null,
    onUploaded: (ids) => {
      const step = viewStepRef.current ?? persistedRef.current;
      if (jobTypeRef.current === "service" || step === "Ausführung") setAssignPhotoIds(ids);
    },
  });
  const documents = useDocumentUpload(id);
  async function onDocuments(list: FileList | null) {
    if (jobTypeRef.current !== "service") return documents(list);
    if (!list?.length) return;
    const images = Array.from(list).filter((f) => classifyUpload(f) === "Bild");
    const rest = Array.from(list).filter((f) => classifyUpload(f) !== "Bild");
    if (images.length) await photos(images);
    if (rest.length) {
      const dt = new DataTransfer();
      rest.forEach((f) => dt.items.add(f));
      await documents(dt.files);
    }
  }
  const files = useFileInputs({ onCamera: photos, onDocuments });
  const capture = useCaptureSheets(id);

  async function setStatus(status: string) {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["job", id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }

  if (job.isLoading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!job.data) return <p className="text-sm">Auftrag nicht gefunden.</p>;
  const j = job.data;
  const c = j.customers;
  const service = j.job_type === "service";
  const persisted = normalizeStatus(j.job_type, j.status);
  const viewStep = selectedWorkflowStep ?? persisted;

  const addMaterial = () => { setMat({ job_id: id, quantity: 1, unit: "Stk", status: "Offen" }); };
  const addLabour = () => { setLab({ job_id: id, hours: 1, hourly_rate: Number(settings.data?.default_hourly_rate ?? 120) }); };

  const captureTiles = (
    <section className="space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4">
      <div>
        <h2 className="text-lg font-semibold">Mit KI erfassen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Einmal erfassen, danach in der Analyse strukturiert prüfen.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="action-tile-primary" onClick={capture.openVoice}><Mic className="h-7 w-7" />Sprache</button>
        <button className="action-tile-primary" onClick={files.openCamera}><Camera className="h-7 w-7" />Foto</button>
        <button className="action-tile-primary" onClick={capture.openText}><FileText className="h-7 w-7" />Text</button>
      </div>
      {!service && (
        <div className="space-y-2 border-t border-primary/10 pt-3">
          <p className="text-sm font-medium text-muted-foreground">Manuell ergänzen</p>
          <div className="grid grid-cols-3 gap-2">
            <SecBtn onClick={files.openUpload} icon={<FileUp className="h-4 w-4" />}>Unterlage</SecBtn>
            <SecBtn onClick={addMaterial} icon={<Package className="h-4 w-4" />}>Material</SecBtn>
            <SecBtn onClick={addLabour} icon={<Wrench className="h-4 w-4" />}>Arbeit</SecBtn>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <Link to="/baustellen" className="-ml-1 inline-flex h-10 items-center text-sm font-medium text-muted-foreground">
        <ChevronLeft className="h-5 w-5" /> Aufträge
      </Link>
      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-2">
          {service ? (
            <span className="rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide bg-warning/15 text-foreground">{JOB_TYPE_LABEL.service}</span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {c ? <Link to="/kunden/$id" params={{ id: c.id }} className="text-primary">{customerName(c)}</Link> : "Ohne Kunde"}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!service && <span className="rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide bg-primary/[0.08] text-primary">{JOB_TYPE_LABEL.project}</span>}
            <StatusBadge status={service ? displayServiceStatus(j.status) : persisted} />
            {isActiveJob(j) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Weitere Aktionen" className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive" onClick={() => setCancelOpen(true)}>
                    {service ? "Auftrag absagen" : "Projekt absagen"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm("Auftrag inkl. aller Fotos, Notizen und Positionen löschen?")) return;
                      const { error } = await supabase.from("jobs").delete().eq("id", id);
                      if (error) return toast.error(error.message);
                      qc.invalidateQueries({ queryKey: ["jobs"] });
                      navigate({ to: "/baustellen" });
                    }}
                  >
                    Auftrag löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{j.title}</h1>
          {!service && address(j) && (
            <a href={`https://maps.apple.com/?q=${encodeURIComponent(address(j))}`} className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {address(j)}
            </a>
          )}
          {!service && c?.phone && (
            <a href={`tel:${c.phone}`} className="mt-1 flex items-center gap-1 text-sm font-medium text-primary"><Phone className="h-4 w-4" /> {c.phone}</a>
          )}
        </div>
        {!service && (
          <StatusStepper
            type={j.job_type}
            status={j.status}
            selected={viewStep}
            onSelect={setSelectedWorkflowStep}
          />
        )}
        {!service && !isActiveJob(j) && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">
            {lifecycleLabel(lifecycleOf(j))}
            {j.cancellation_reason ? ` – ${j.cancellation_reason}` : ""}
            {lifecycleOf(j) === "completed" && j.completed_at ? ` · ${formatDate(j.completed_at, true)}` : ""}
            {lifecycleOf(j) === "cancelled" && j.cancelled_at ? ` · ${formatDate(j.cancelled_at, true)}` : ""}
          </p>
        )}
        {!service && j.appointment_at && <p className="text-sm text-muted-foreground">Termin {formatDate(j.appointment_at, true)}</p>}
        {!service && j.internal_notes && <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-semibold">Intern: </span>{j.internal_notes}</p>}
      </div>
      {files.inputs}
      {capture.sheets}
      <PhotoAssignSheet key={assignPhotoIds.join(",")} jobId={id} photoIds={assignPhotoIds} onClose={() => setAssignPhotoIds([])} />

      {!service && (
        <ProjectStepContent
          step={viewStep}
          job={j}
          jobId={id}
          captureTiles={captureTiles}
          onAddMaterial={addMaterial}
          onAddLabour={addLabour}
          onEditMaterial={setMat}
          onEditLabour={setLab}
          onViewSources={() => setSourcesOpen(true)}
          onAddPhoto={files.openCamera}
          onPhotoFiles={photos}
          onConfirmOffer={async () => {
            const vatRate = Number(settings.data?.vat_rate ?? 8.1);
            const { data: lab } = await supabase.from("labour_items").select("*").eq("job_id", id);
            const { data: mat } = await supabase.from("material_requirements").select("*, products(*)").eq("job_id", id);
            const totals = computeQuote(lab ?? [], mat ?? [], vatRate, Number(settings.data?.default_material_markup ?? 0));
            const { error: qErr } = await supabase.from("quotations").insert({
              job_id: id,
              status: "Bestätigt",
              total: totals.total,
            });
            if (qErr) { toast.error(qErr.message); return; }
            await setStatus("Ausführung");
            setSelectedWorkflowStep("Ausführung");
            toast.success("Offerte bestätigt – Ausführung");
          }}
          onTouchOfferte={async () => {
            const current = normalizeStatus(j.job_type, j.status);
            const curIdx = PROJECT_STEPS.indexOf(current as (typeof PROJECT_STEPS)[number]);
            const offerIdx = PROJECT_STEPS.indexOf("Offerte");
            if (curIdx >= 0 && curIdx < offerIdx) await setStatus("Offerte");
          }}
          onComplete={async () => {
            if (!confirm("Projekt wirklich abschliessen? Es erscheint danach im Archiv.")) return;
            try {
              await completeJob(id);
              toast.success("Projekt abgeschlossen");
              qc.invalidateQueries({ queryKey: ["job", id] });
              qc.invalidateQueries({ queryKey: ["jobs"] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Abschliessen fehlgeschlagen");
            }
          }}
          onDeleted={() => navigate({ to: "/baustellen" })}
        />
      )}

      {service && (
        <ServiceJobView
          job={j}
          onUpload={files.openUpload}
          onCamera={files.openCamera}
          onVoice={capture.openVoice}
          onText={capture.openText}
          onPhotoFiles={photos}
          onDeleted={() => navigate({ to: "/baustellen" })}
        />
      )}

      <MaterialEditor key={mat ? (mat.id ?? "new" + (mat.description ?? "")) : "none"} draft={mat} onClose={() => {
        setMat(null);
        if (!service && viewStep === "Offerte") void (async () => {
          const curIdx = PROJECT_STEPS.indexOf(persisted as (typeof PROJECT_STEPS)[number]);
          if (curIdx >= 0 && curIdx < PROJECT_STEPS.indexOf("Offerte")) await setStatus("Offerte");
        })();
      }} />
      <LabourEditor key={lab ? (lab.id ?? "new" + (lab.description ?? "")) : "none"} draft={lab} onClose={() => {
        setLab(null);
        if (!service && viewStep === "Offerte") void (async () => {
          const curIdx = PROJECT_STEPS.indexOf(persisted as (typeof PROJECT_STEPS)[number]);
          if (curIdx >= 0 && curIdx < PROJECT_STEPS.indexOf("Offerte")) await setStatus("Offerte");
        })();
      }} />
      <SourceFilesSheet jobId={id} open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
      <Sheet open={cancelOpen} onOpenChange={setCancelOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{service ? "Auftrag absagen" : "Projekt absagen"}</SheetTitle></SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <p className="text-sm text-muted-foreground">{service ? "Der Auftrag wird abgesagt und erscheint im Archiv. Alle Daten bleiben erhalten." : "Kunde hat die Offerte abgelehnt oder das Projekt wird beendet. Alle Daten bleiben im Archiv."}</p>
            <Field label="Grund (optional)">
              <Textarea className="min-h-20 text-base" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="z.B. Offerte abgelehnt" />
            </Field>
            <Button
              variant="outline"
              className="h-12 w-full text-destructive"
              onClick={async () => {
                if (!confirm(service ? "Auftrag absagen und ins Archiv verschieben?" : "Projekt absagen und ins Archiv verschieben?")) return;
                try {
                  await cancelJob(id, cancelReason.trim() || null);
                  if (service) {
                    await supabase.from("jobs").update({ status: "Abgesagt" }).eq("id", id);
                  }
                  toast.success(service ? "Auftrag abgesagt" : "Projekt abgesagt");
                  setCancelOpen(false);
                  qc.invalidateQueries({ queryKey: ["job", id] });
                  qc.invalidateQueries({ queryKey: ["jobs"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Absagen fehlgeschlagen");
                }
              }}
            >
              Absagen und archivieren
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProjectStepContent({
  step,
  job,
  jobId,
  captureTiles,
  onAddMaterial,
  onAddLabour,
  onEditMaterial,
  onEditLabour,
  onViewSources,
  onAddPhoto,
  onPhotoFiles,
  onConfirmOffer,
  onTouchOfferte,
  onComplete,
  onDeleted,
}: {
  step: string;
  job: Job & { customers?: { id: string; company_name: string | null; first_name: string | null; last_name: string | null } | null };
  jobId: string;
  captureTiles: React.ReactNode;
  onAddMaterial: () => void;
  onAddLabour: () => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onEditLabour: (d: Partial<Labour> & { job_id: string }) => void;
  onViewSources: () => void;
  onAddPhoto: () => void;
  onPhotoFiles: (files: FileList | File[] | null) => Promise<void> | void;
  onConfirmOffer: () => Promise<void>;
  onTouchOfferte: () => void;
  onComplete: () => void;
  onDeleted: () => void;
}) {
  switch (step) {
    case "Begehung":
      return (
        <div className="space-y-6">
          <div className="space-y-2">{captureTiles}</div>
          <OpenQuestions jobId={jobId} />
          <PhotoGallery jobId={jobId} />
          <DocumentList jobId={jobId} />
          <NotesList jobId={jobId} />
          <section className="space-y-3">
            <h2 className="section-title">Material manuell</h2>
            <MaterialList jobId={jobId} onEdit={onEditMaterial} />
            <Button variant="outline" className="h-12 w-full" onClick={onAddMaterial}>+ Material hinzufügen</Button>
          </section>
          <section className="space-y-3">
            <h2 className="section-title">Arbeit manuell</h2>
            <LabourList jobId={jobId} onEdit={onEditLabour} />
            <Button variant="outline" className="h-12 w-full" onClick={onAddLabour}>+ Arbeitsleistung hinzufügen</Button>
          </section>
        </div>
      );
    case "Analyse":
      return (
        <div className="space-y-6">
          <AiAnalysis jobId={jobId} onEditMaterial={onEditMaterial} onEditLabour={onEditLabour} />
          <OpenQuestions jobId={jobId} />
        </div>
      );
    case "Grobkosten":
      return (
        <section className="space-y-2">
          <h2 className="section-title">Grobkostenschätzung</h2>
          <CostEstimate jobId={jobId} />
        </section>
      );
    case "Produktauswahl":
    case "Kalkulation":
    case "Offerte":
      return (
        <OfferteWorkspace
          job={job}
          jobId={jobId}
          onEditLabour={onEditLabour}
          onEditMaterial={onEditMaterial}
          onViewSources={onViewSources}
          onConfirmed={() => void onConfirmOffer()}
          onTouchOfferte={onTouchOfferte}
        />
      );
    case "Auftrag":
    case "Ausführung":
      return (
        <AusfuehrungWorkspace
          jobId={jobId}
          onAddPhoto={onAddPhoto}
          onEditMaterial={onEditMaterial}
          onPhotoFiles={onPhotoFiles}
        />
      );
    case "Rechnung":
      return <AbrechnungPlaceholder jobId={jobId} />;
    case "Abgeschlossen":
      return (
        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <h2 className="section-title">Abschluss</h2>
            <p className="text-sm text-muted-foreground">Ansicht – das Projekt ist erst abgeschlossen, wenn Sie unten bestätigen.</p>
            <Row label="Projekt" value={job.title} />
            <Row label="Kunde" value={customerName(job.customers)} />
            <Row label="Adresse" value={address(job) || "–"} />
            <Row label="Workflow" value={job.status} />
            <Row label="Lebenszyklus" value={lifecycleLabel(lifecycleOf(job))} />
            {job.completed_at && <Row label="Abgeschlossen" value={formatDate(job.completed_at, true)} />}
            {job.cancelled_at && <Row label="Abgesagt" value={formatDate(job.cancelled_at, true)} />}
          </section>
          {isActiveJob(job) && <CompletionChecklist jobId={jobId} onComplete={onComplete} />}
          <JobDetails job={job} onDeleted={onDeleted} />
        </div>
      );
    default:
      return (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Unbekannter Schritt «{step}». Projektstatus: {job.status}
        </p>
      );
  }
}

function AbrechnungPlaceholder({ jobId }: { jobId: string }) {
  return (
    <div className="space-y-4">
      <QuoteTotalsCard jobId={jobId} />
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="section-title">Kundenrechnung</h2>
        <p className="text-sm text-muted-foreground">SOLL aus der bestätigten Offerte, IST aus der Ausführung. Rechnung an den Kunden folgt (ohne Bexio).</p>
        <button disabled className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-muted-foreground opacity-70">
          <FileText className="h-4 w-4" /> Rechnung in Bexio erstellen (folgt)
        </button>
      </section>
      <SupplierInvoices jobId={jobId} />
      <Nachkalkulation jobId={jobId} />
    </div>
  );
}

function CompletionChecklist({ jobId, onComplete }: { jobId: string; onComplete: () => void }) {
  const materials = useMaterials(jobId);
  const labour = useLabour(jobId);
  const open = useQuery({
    queryKey: ["open", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("open_questions").select("id, status").eq("job_id", jobId);
      if (error) throw error;
      return data;
    },
  });
  const openCount = (open.data ?? []).filter((o) => o.status === "offen").length;
  const unpriced = (materials.data ?? []).filter((m) => {
    const raw = (m as { products?: { purchase_price: number | null; sales_price: number | null; markup: number | null } | { purchase_price: number | null; sales_price: number | null; markup: number | null }[] | null }).products;
    const p = Array.isArray(raw) ? raw[0] : raw;
    return !p || unitSalesPrice(p) == null;
  }).length;
  const noLabour = !(labour.data ?? []).length;
  const warnings = [
    openCount ? `${openCount} offene Punkte vorhanden` : null,
    unpriced ? `${unpriced} Materialpositionen ohne Preis` : null,
    noLabour ? "Keine Arbeitszeiten erfasst" : null,
    "Abrechnung / Rechnung noch nicht in Bexio (folgt)",
  ].filter(Boolean) as string[];
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      {warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}
      <Button className="h-14 w-full text-base font-semibold" onClick={onComplete}>Projekt abschliessen</Button>
    </section>
  );
}

function SecBtn({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-12 items-center justify-center gap-1.5 rounded-lg border bg-card px-2 text-xs font-semibold text-foreground">
      <span className="text-primary">{icon}</span>{children}
    </button>
  );
}

function JobDetails({ job, onDeleted }: { job: { id: string; title: string; street: string | null; zip: string | null; city: string | null; notes: string | null; internal_notes: string | null }; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ title: job.title, street: job.street ?? "", zip: job.zip ?? "", city: job.city ?? "", notes: job.notes ?? "", internal_notes: job.internal_notes ?? "" });
  async function save() {
    const { error } = await supabase.from("jobs").update(d).eq("id", job.id);
    if (error) return toast.error(error.message);
    toast.success("Gespeichert");
    qc.invalidateQueries({ queryKey: ["job", job.id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }
  async function remove() {
    if (!confirm("Auftrag inkl. aller Fotos, Notizen und Positionen löschen?")) return;
    await supabase.from("jobs").delete().eq("id", job.id);
    qc.invalidateQueries({ queryKey: ["jobs"] });
    onDeleted();
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <Field label="Projekttitel"><Input className="h-12 text-base" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <Field label="Strasse"><Input className="h-12 text-base" value={d.street} onChange={(e) => setD({ ...d, street: e.target.value })} /></Field>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="PLZ"><Input className="h-12 text-base" value={d.zip} onChange={(e) => setD({ ...d, zip: e.target.value })} /></Field>
        <Field label="Ort"><Input className="h-12 text-base" value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></Field>
      </div>
      <Field label="Notizen"><Textarea className="min-h-24 text-base" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      <Field label="Interne Notizen"><Textarea className="min-h-20 text-base" value={d.internal_notes} onChange={(e) => setD({ ...d, internal_notes: e.target.value })} /></Field>
      <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
      <Button variant="outline" className="h-12 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /> Auftrag löschen</Button>
    </div>
  );
}
