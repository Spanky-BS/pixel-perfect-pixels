import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Mic, FileText, Package, Wrench, MapPin, Phone, Trash2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { NotesList, PhotoGallery, useCaptureSheets, useFileInputs, usePhotoUpload } from "@/components/job/CaptureSection";
import { MaterialEditor, MaterialList, useMaterials } from "@/components/job/MaterialList";
import { LabourEditor, LabourList, useLabour } from "@/components/job/LabourList";
import { settingsQuery } from "@/lib/queries";
import { StatusStepper } from "@/components/job/StatusStepper";
import { AiAnalysis, OpenQuestions } from "@/components/job/AiAnalysis";
import { CostEstimate } from "@/components/job/CostEstimate";
import { Kalkulation } from "@/components/job/Kalkulation";
import { ServiceCompletion, ServiceLabour, ServiceMaterial, ServiceOrder } from "@/components/job/ServiceSections";
import { JOB_TYPE_LABEL, address, customerName, formatDate, type Labour, type Material } from "@/lib/app";

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

type Tab = "aufnahme" | "material" | "arbeit" | "kalkulation" | "details" | "auftrag" | "fotos" | "abschluss";

function JobPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab | null>(null);
  const [mat, setMat] = useState<(Partial<Material> & { job_id: string }) | null>(null);
  const [lab, setLab] = useState<(Partial<Labour> & { job_id: string }) | null>(null);
  const settings = useQuery(settingsQuery());
  const materials = useMaterials(id);
  const labour = useLabour(id);

  const job = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*, customers(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const upload = usePhotoUpload(id);
  const files = useFileInputs({ onFiles: upload });
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
  const cur: Tab = tab ?? (service ? "auftrag" : "aufnahme");

  const addMaterial = () => { setMat({ job_id: id, quantity: 1, unit: "Stk", status: "Offen" }); setTab("material"); };
  const addLabour = () => { setLab({ job_id: id, hours: 1, hourly_rate: Number(settings.data?.default_hourly_rate ?? 120) }); setTab("arbeit"); };

  const tabs: [Tab, string][] = service
    ? [["auftrag", "Auftrag"], ["arbeit", "Arbeit"], ["material", "Material"], ["fotos", "Fotos"], ["abschluss", "Abschluss"]]
    : [["aufnahme", "Aufnahme"], ["material", `Material${materials.data?.length ? ` (${materials.data.length})` : ""}`], ["arbeit", `Arbeit${labour.data?.length ? ` (${labour.data.length})` : ""}`], ["kalkulation", "Kalkulation"], ["details", "Details"]];

  const captureTiles = (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button className="action-tile-primary" onClick={files.openCamera}><Camera className="h-7 w-7" />Foto</button>
        <button className="action-tile-primary" onClick={capture.openVoice}><Mic className="h-7 w-7" />Sprache</button>
        <button className="action-tile-primary" onClick={capture.openText}><FileText className="h-7 w-7" />Text</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <SecBtn onClick={files.openUpload} icon={<ImagePlus className="h-4 w-4" />}>Foto hochladen</SecBtn>
        {!service && <SecBtn onClick={addMaterial} icon={<Package className="h-4 w-4" />}>Material manuell</SecBtn>}
        {!service && <SecBtn onClick={addLabour} icon={<Wrench className="h-4 w-4" />}>Arbeit manuell</SecBtn>}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <Link to="/baustellen" className="-ml-1 inline-flex h-10 items-center text-sm font-medium text-muted-foreground">
        <ChevronLeft className="h-5 w-5" /> Aufträge
      </Link>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {c ? <Link to="/kunden/$id" params={{ id: c.id }} className="text-primary">{customerName(c)}</Link> : "Ohne Kunde"}
          </span>
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${service ? "bg-warning/20 text-foreground" : "bg-primary/10 text-primary"}`}>{JOB_TYPE_LABEL[service ? "service" : "project"]}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">{j.title}</h1>
          {address(j) && (
            <a href={`https://maps.apple.com/?q=${encodeURIComponent(address(j))}`} className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {address(j)}
            </a>
          )}
          {c?.phone && (
            <a href={`tel:${c.phone}`} className="mt-1 flex items-center gap-1 text-sm font-medium text-primary"><Phone className="h-4 w-4" /> {c.phone}</a>
          )}
        </div>
        <StatusStepper type={j.job_type} status={j.status} onChange={setStatus} />
        <div className="text-xs text-muted-foreground">
          Erstellt {formatDate(j.created_at)} · Bearbeitet {formatDate(j.updated_at, true)}
          {j.appointment_at && <> · Termin {formatDate(j.appointment_at, true)}</>}
        </div>
        {j.internal_notes && <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-semibold">Intern: </span>{j.internal_notes}</p>}
      </div>
      {files.inputs}
      {capture.sheets}

      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 min-w-0 flex-1 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold ${cur === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>

      {cur === "aufnahme" && (
        <div className="space-y-6">
          <div className="space-y-2">{captureTiles}</div>
          <AiAnalysis jobId={id} onEditMaterial={setMat} onEditLabour={setLab} />
          <OpenQuestions jobId={id} />
          <PhotoGallery jobId={id} />
          <NotesList jobId={id} />
        </div>
      )}
      {cur === "material" && !service && (
        <div className="space-y-3">
          <MaterialList jobId={id} onEdit={setMat} />
          <Button variant="outline" className="h-12 w-full" onClick={addMaterial}>+ Material hinzufügen</Button>
        </div>
      )}
      {cur === "arbeit" && !service && (
        <div className="space-y-3">
          <LabourList jobId={id} onEdit={setLab} />
          <Button variant="outline" className="h-12 w-full" onClick={addLabour}>+ Arbeitsleistung hinzufügen</Button>
        </div>
      )}
      {cur === "kalkulation" && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="section-title">Grobkostenschätzung (optional)</h2>
            <CostEstimate jobId={id} />
          </section>
          <section className="space-y-2">
            <h2 className="section-title">Detailkalkulation</h2>
            <Kalkulation jobId={id} />
          </section>
        </div>
      )}
      {cur === "details" && <JobDetails job={j} onDeleted={() => navigate({ to: "/baustellen" })} />}

      {cur === "auftrag" && (
        <div className="space-y-6">
          <div className="space-y-2">{captureTiles}</div>
          <ServiceOrder job={j} />
          <NotesList jobId={id} />
          <JobDetails job={j} onDeleted={() => navigate({ to: "/baustellen" })} />
        </div>
      )}
      {cur === "arbeit" && service && <ServiceLabour jobId={id} />}
      {cur === "material" && service && <ServiceMaterial jobId={id} />}
      {cur === "fotos" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button className="action-tile-primary" onClick={files.openCamera}><Camera className="h-7 w-7" />Foto aufnehmen</button>
            <button className="action-tile" onClick={files.openUpload}><ImagePlus className="h-6 w-6 text-primary" />Foto hochladen</button>
          </div>
          <p className="text-xs text-muted-foreground">Tipp: Kategorie «Vorher» / «Nachher» beim Foto setzen.</p>
          <PhotoGallery jobId={id} />
        </div>
      )}
      {cur === "abschluss" && <ServiceCompletion job={j} onStatus={setStatus} />}

      <MaterialEditor key={mat ? (mat.id ?? "new" + (mat.description ?? "")) : "none"} draft={mat} onClose={() => setMat(null)} />
      <LabourEditor key={lab ? (lab.id ?? "new" + (lab.description ?? "")) : "none"} draft={lab} onClose={() => setLab(null)} />
    </div>
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
