import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Mic, FileText, Package, Wrench, MapPin, Phone, Trash2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "@/components/CustomerForm";
import { NotesList, PhotoGallery, useCaptureSheets, useFileInputs, usePhotoUpload } from "@/components/job/CaptureSection";
import { MaterialEditor, MaterialList, useMaterials } from "@/components/job/MaterialList";
import { LabourEditor, LabourList, useLabour } from "@/components/job/LabourList";
import { settingsQuery } from "@/lib/queries";
import { JOB_STATUSES, address, customerName, formatDate, type Labour, type Material } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/baustellen/$id")({
  head: () => ({
    meta: [
      { title: "Baustelle – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Baustelle mit Fotos, Notizen, Material und Arbeitsleistungen." },
      { property: "og:title", content: "Baustelle – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Baustelle mit Fotos, Notizen, Material und Arbeitsleistungen." },
    ],
  }),
  component: JobPage,
});

type Tab = "aufnahme" | "material" | "arbeit" | "details";

function JobPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("aufnahme");
  const [mat, setMat] = useState<(Partial<Material> & { job_id: string }) | null>(null);
  const [lab, setLab] = useState<(Partial<Labour> & { job_id: string }) | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
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
    await supabase.from("jobs").update({ status }).eq("id", id);
    setStatusOpen(false);
    qc.invalidateQueries({ queryKey: ["job", id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }

  if (job.isLoading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!job.data) return <p className="text-sm">Baustelle nicht gefunden.</p>;
  const j = job.data;
  const c = j.customers;

  const addMaterial = () => { setMat({ job_id: id, quantity: 1, unit: "Stk", status: "Offen" }); setTab("material"); };
  const addLabour = () => { setLab({ job_id: id, hours: 1, hourly_rate: Number(settings.data?.default_hourly_rate ?? 120) }); setTab("arbeit"); };

  return (
    <div className="space-y-4">
      <Link to="/baustellen" className="-ml-1 inline-flex h-10 items-center text-sm font-medium text-muted-foreground">
        <ChevronLeft className="h-5 w-5" /> Baustellen
      </Link>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {c ? <Link to="/kunden/$id" params={{ id: c.id }} className="text-primary">{customerName(c)}</Link> : "Ohne Kunde"}
        </div>
        <h1 className="text-xl font-bold leading-tight">{j.title}</h1>
        {address(j) && (
          <a href={`https://maps.apple.com/?q=${encodeURIComponent(address(j))}`} className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" /> {address(j)}
          </a>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setStatusOpen(true)} className="h-10 rounded-lg bg-secondary px-3 text-sm font-semibold text-secondary-foreground">
            Status: {j.status} ▾
          </button>
          {c?.phone && (
            <a href={`tel:${c.phone}`} className="flex h-10 items-center gap-1 rounded-lg border px-3 text-sm font-medium"><Phone className="h-4 w-4" /> Anrufen</a>
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Erstellt {formatDate(j.created_at)} · Bearbeitet {formatDate(j.updated_at, true)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="action-tile-primary" onClick={files.openCamera}><Camera className="h-7 w-7" />Foto aufnehmen</button>
        <button className="action-tile-primary" onClick={capture.openVoice}><Mic className="h-7 w-7" />Spracheingabe</button>
        <button className="action-tile" onClick={files.openUpload}><ImagePlus className="h-6 w-6 text-primary" />Foto hochladen</button>
        <button className="action-tile" onClick={capture.openText}><FileText className="h-6 w-6 text-primary" />Textnotiz</button>
        <button className="action-tile" onClick={addMaterial}><Package className="h-6 w-6 text-primary" />Material hinzufügen</button>
        <button className="action-tile" onClick={addLabour}><Wrench className="h-6 w-6 text-primary" />Arbeitsleistung hinzufügen</button>
      </div>
      {files.inputs}
      {capture.sheets}

      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {([
            ["aufnahme", "Aufnahme"],
            ["material", `Material${materials.data?.length ? ` (${materials.data.length})` : ""}`],
            ["arbeit", `Arbeit${labour.data?.length ? ` (${labour.data.length})` : ""}`],
            ["details", "Details"],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-md text-xs font-semibold ${tab === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "aufnahme" && (
        <div className="space-y-6">
          <PhotoGallery jobId={id} />
          <NotesList jobId={id} />
        </div>
      )}
      {tab === "material" && (
        <div className="space-y-3">
          <MaterialList jobId={id} onEdit={setMat} />
          <Button variant="outline" className="h-12 w-full" onClick={addMaterial}>+ Material hinzufügen</Button>
        </div>
      )}
      {tab === "arbeit" && (
        <div className="space-y-3">
          <LabourList jobId={id} onEdit={setLab} />
          <Button variant="outline" className="h-12 w-full" onClick={addLabour}>+ Arbeitsleistung hinzufügen</Button>
        </div>
      )}
      {tab === "details" && <JobDetails job={j} onDeleted={() => navigate({ to: "/baustellen" })} />}

      <MaterialEditor key={mat ? (mat.id ?? "new") : "none"} draft={mat} onClose={() => setMat(null)} />
      <LabourEditor key={lab ? (lab.id ?? "new") : "none"} draft={lab} onClose={() => setLab(null)} />

      <Sheet open={statusOpen} onOpenChange={setStatusOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Status ändern</SheetTitle></SheetHeader>
          <div className="grid gap-2 p-4 pt-0">
            {JOB_STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`h-12 rounded-lg border text-left px-4 font-medium ${j.status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s}</button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function JobDetails({ job, onDeleted }: { job: { id: string; title: string; street: string | null; zip: string | null; city: string | null; notes: string | null }; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ title: job.title, street: job.street ?? "", zip: job.zip ?? "", city: job.city ?? "", notes: job.notes ?? "" });
  async function save() {
    const { error } = await supabase.from("jobs").update(d).eq("id", job.id);
    if (error) return toast.error(error.message);
    toast.success("Gespeichert");
    qc.invalidateQueries({ queryKey: ["job", job.id] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }
  async function remove() {
    if (!confirm("Baustelle inkl. aller Fotos, Notizen und Positionen löschen?")) return;
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
      <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
      <Button variant="outline" className="h-12 w-full text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /> Baustelle löschen</Button>
    </div>
  );
}
