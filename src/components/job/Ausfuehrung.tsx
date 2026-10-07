import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Check, FileText, Mic, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentList, NotesList, PhotoGallery } from "@/components/job/CaptureSection";
import { VoiceRecorder } from "@/components/job/VoiceRecorder";
import { useImageSourceChooser } from "@/components/ImageSourceChooser";
import { MaterialList, useMaterials } from "@/components/job/MaterialList";
import { useLabour } from "@/components/job/LabourList";
import { extractProjectExecution } from "@/lib/ai.functions";
import { settingsQuery } from "@/lib/queries";
import {
  EXECUTION_SOURCE,
  defaultTechnician,
  formatDate,
  type Labour,
  type Material,
} from "@/lib/app";
import { extraLabour, quotedLabour } from "@/lib/project-quote";

export function useTimeEntries(jobId: string) {
  return useQuery({
    queryKey: ["labour_time_entries", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("labour_time_entries").select("*").eq("job_id", jobId).order("worked_on").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function AusfuehrungWorkspace({
  jobId,
  onAddPhoto,
  onEditMaterial,
  onPhotoFiles,
}: {
  jobId: string;
  onAddPhoto: () => void;
  onEditMaterial: (d: Partial<Material> & { job_id: string }) => void;
  onPhotoFiles: (files: FileList | File[] | null) => Promise<void> | void;
}) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const labour = useLabour(jobId);
  const materials = useMaterials(jobId);
  const times = useTimeEntries(jobId);
  const quoted = quotedLabour(labour.data);
  const extra = extraLabour(labour.data);
  const entries = times.data ?? [];
  const technician = defaultTechnician(settings.data);
  const [timeFor, setTimeFor] = useState<Labour | "extra" | null>(null);
  const [actualQty, setActualQty] = useState<Record<string, string>>({});

  function entriesFor(id: string) {
    return entries.filter((e) => e.labour_item_id === id);
  }
  function istHours(id: string) {
    return entriesFor(id).reduce((s, e) => s + Number(e.hours), 0);
  }

  async function saveActualQty(m: Material) {
    const raw = actualQty[m.id] ?? String(m.actual_quantity ?? "");
    const n = Number(raw);
    if (!Number.isFinite(n)) return toast.error("Menge ungültig");
    const { error } = await supabase.from("material_requirements").update({ actual_quantity: n }).eq("id", m.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
    toast.success("Ist-Menge gespeichert");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Ausführung</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">SOLL aus der bestätigten Offerte – IST vor Ort erfassen.</p>
      </div>

      <ProjectExecutionCapture jobId={jobId} onPhotoFiles={onPhotoFiles} />

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Offertpositionen / Arbeiten</h3>
        {!quoted.length && <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">Keine Offertpositionen. Bitte zuerst die Offerte bestätigen.</p>}
        {quoted.map((l) => {
          const ist = istHours(l.id);
          const rows = entriesFor(l.id);
          return (
            <article key={l.id} className="rounded-lg border border-border/80 bg-card px-3 py-3">
              <p className="font-semibold uppercase tracking-wide">{l.description || "–"}</p>
              {l.notes?.trim() && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{l.notes}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Offerte</p>
                  <p className="font-medium">{Number(l.hours).toLocaleString("de-CH")} h</p>
                </div>
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">IST</p>
                  <p className="font-medium">{ist.toLocaleString("de-CH")} h</p>
                </div>
              </div>
              {rows.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {rows.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">
                        {e.worked_on ? formatDate(e.worked_on) : "Ohne Datum"} · {e.technician || technician} · {Number(e.hours).toLocaleString("de-CH")} h
                        {e.notes?.trim() ? ` – ${e.notes}` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label="Eintrag löschen"
                        className="flex h-10 w-10 shrink-0 items-center justify-center text-destructive"
                        onClick={async () => {
                          await supabase.from("labour_time_entries").delete().eq("id", e.id);
                          qc.invalidateQueries({ queryKey: ["labour_time_entries", jobId] });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="mt-2 inline-flex h-11 items-center text-sm font-medium text-primary" onClick={() => setTimeFor(l)}>
                + IST-Stunden
              </button>
            </article>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">Zusätzlich ausgeführte Arbeiten</h3>
          <button type="button" className="inline-flex h-10 shrink-0 items-center text-sm font-medium text-primary" onClick={() => setTimeFor("extra")}>
            + Hinzufügen
          </button>
        </div>
        {!extra.length && <p className="text-sm text-muted-foreground">Keine Zusatzarbeiten.</p>}
        {extra.map((l) => {
          const ist = istHours(l.id);
          return (
            <article key={l.id} className="rounded-lg border border-dashed border-primary/40 bg-card px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Zusatz</p>
              <p className="font-semibold">{l.description || "–"}</p>
              <p className="mt-1 text-sm">IST {ist.toLocaleString("de-CH")} h</p>
              {entriesFor(l.id).map((e) => (
                <p key={e.id} className="text-sm text-muted-foreground">
                  {e.worked_on ? formatDate(e.worked_on) : "Ohne Datum"} · {e.technician || technician} · {Number(e.hours).toLocaleString("de-CH")} h
                  {e.notes?.trim() ? ` – ${e.notes}` : ""}
                </p>
              ))}
              <button type="button" className="mt-1 text-sm font-medium text-primary" onClick={() => setTimeFor(l)}>+ Zeit</button>
            </article>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">Material</h3>
          <button
            type="button"
            className="inline-flex h-10 items-center text-sm font-medium text-primary"
            onClick={() => onEditMaterial({ job_id: jobId, quantity: 1, unit: "Stk", status: "Offen", source: EXECUTION_SOURCE })}
          >
            + Hinzufügen
          </button>
        </div>
        {(materials.data ?? []).map((m) => (
          <article key={m.id} className="rounded-lg border border-border/80 bg-card px-3 py-3">
            {m.source === EXECUTION_SOURCE && <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Zusatz</p>}
            <p className="font-semibold">{m.description || "–"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Offerte: {Number(m.quantity)} {m.unit}</p>
            <div className="mt-2 flex items-end gap-2">
              <Field label="IST-Menge">
                <Input
                  className="h-12 text-base"
                  type="number"
                  inputMode="decimal"
                  value={actualQty[m.id] ?? (m.actual_quantity != null ? String(m.actual_quantity) : "")}
                  onChange={(e) => setActualQty((s) => ({ ...s, [m.id]: e.target.value }))}
                  placeholder={String(m.quantity)}
                />
              </Field>
              <Button type="button" variant="outline" className="h-12 shrink-0" onClick={() => void saveActualQty(m)}>OK</Button>
            </div>
            {m.actual_quantity == null && (
              <button
                type="button"
                className="mt-1 text-sm font-medium text-primary"
                onClick={async () => {
                  await supabase.from("material_requirements").update({ actual_quantity: Number(m.quantity) }).eq("id", m.id);
                  qc.invalidateQueries({ queryKey: ["materials", jobId] });
                }}
              >
                Wie Offerte übernehmen
              </button>
            )}
          </article>
        ))}
        {!materials.data?.length && <MaterialList jobId={jobId} onEdit={onEditMaterial} />}
      </section>

      <section className="space-y-3">
        <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium" onClick={onAddPhoto}>
          <Camera className="h-4 w-4" /> Foto
        </button>
        <PhotoGallery jobId={jobId} variant="service" title="Fotos & Dokumentation" />
        <NotesList jobId={jobId} hideEmpty />
        <DocumentList jobId={jobId} hideEmpty />
      </section>

      {timeFor && (
        <TimeEntrySheet
          jobId={jobId}
          labour={timeFor === "extra" ? null : timeFor}
          extra={timeFor === "extra"}
          technician={technician}
          onClose={() => setTimeFor(null)}
        />
      )}
    </div>
  );
}

function TimeEntrySheet({
  jobId,
  labour,
  extra,
  technician,
  onClose,
}: {
  jobId: string;
  labour: Labour | null;
  extra: boolean;
  technician: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState(labour?.description ?? "");
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tech, setTech] = useState(technician);

  async function save() {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return toast.error("Stunden angeben");
    let labourId = labour?.id;
    if (extra) {
      if (!description.trim()) return toast.error("Beschreibung angeben");
      const { data, error } = await supabase.from("labour_items").insert({
        job_id: jobId,
        description: description.trim(),
        hours: 0,
        hourly_rate: 0,
        notes: note.trim() || null,
        source: EXECUTION_SOURCE,
        sort_order: Date.now() % 1e9,
      }).select("id").single();
      if (error || !data) return toast.error(error?.message ?? "Speichern fehlgeschlagen");
      labourId = data.id;
    }
    if (!labourId) return;
    const { error } = await supabase.from("labour_time_entries").insert({
      job_id: jobId,
      labour_item_id: labourId,
      hours: h,
      notes: note.trim() || null,
      technician: tech.trim() || technician,
      worked_on: date || null,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["labour", jobId] });
    qc.invalidateQueries({ queryKey: ["labour_time_entries", jobId] });
    onClose();
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader><SheetTitle>{extra ? "Zusätzliche Arbeit" : "IST-Stunden"}</SheetTitle></SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          {labour && <p className="text-sm text-muted-foreground">{labour.description} · Offerte {Number(labour.hours).toLocaleString("de-CH")} h</p>}
          {extra && <Field label="Beschreibung"><Input className="h-12 text-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z.B. Zusatzleitung wegen Leitungsverlauf" /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="IST-Stunden"><Input className="h-12 text-base" type="number" inputMode="decimal" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            <Field label="Datum"><Input className="h-12 text-base" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Techniker"><Input className="h-12 text-base" value={tech} onChange={(e) => setTech(e.target.value)} /></Field>
          <Field label="Notiz (optional)"><Textarea className="min-h-20 text-base" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button className="h-12 w-full font-semibold" onClick={() => void save()}>Speichern</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectExecutionCapture({
  jobId,
  onPhotoFiles,
}: {
  jobId: string;
  onPhotoFiles: (files: FileList | File[] | null) => Promise<void> | void;
}) {
  const qc = useQueryClient();
  const run = useServerFn(extractProjectExecution);
  const settings = useQuery(settingsQuery());
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sprache" | "foto" | "text" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [labour, setLabour] = useState<Array<{ keep: boolean; labourItemId: string | null; description: string; hours: number; note: string; extra: boolean }>>([]);
  const [material, setMaterial] = useState<Array<{ keep: boolean; materialId: string | null; description: string; quantity: number; unit: string }>>([]);
  const hasProposal = labour.length + material.length > 0;

  async function analyze(opts?: { extraText?: string; usePhotos?: boolean }) {
    const extraText = opts?.extraText ?? prompt;
    setBusy(true);
    try {
      const r = await run({ data: { jobId, extraText: extraText || undefined, usePhotos: opts?.usePhotos } });
      if (!r.labour.length && !r.material.length) {
        toast.message("Nichts erkannt – Beschreibung ergänzen");
        return;
      }
      setLabour(r.labour.map((x) => ({ keep: true, ...x })));
      setMaterial(r.material.map((x) => ({ keep: true, ...x })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auswertung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const images = useImageSourceChooser({
    multipleImages: true,
    onImage: async (files) => {
      if (!files?.length) return;
      setMode("foto");
      await onPhotoFiles(files);
      await analyze({ usePhotos: true, extraText: prompt });
    },
  });

  async function apply() {
    const technician = defaultTechnician(settings.data);
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const row of labour.filter((r) => r.keep)) {
        let labourId = row.labourItemId;
        if (row.extra || !labourId) {
          const { data, error } = await supabase.from("labour_items").insert({
            job_id: jobId,
            description: row.description,
            hours: 0,
            hourly_rate: 0,
            notes: row.note || null,
            source: EXECUTION_SOURCE,
            sort_order: Date.now() % 1e9,
          }).select("id").single();
          if (error || !data) throw error ?? new Error("Arbeit speichern fehlgeschlagen");
          labourId = data.id;
        }
        const { error } = await supabase.from("labour_time_entries").insert({
          job_id: jobId,
          labour_item_id: labourId,
          hours: row.hours,
          notes: row.note || null,
          technician,
          worked_on: today,
        });
        if (error) throw error;
      }
      for (const row of material.filter((r) => r.keep)) {
        if (row.materialId) {
          const { error } = await supabase.from("material_requirements").update({ actual_quantity: row.quantity }).eq("id", row.materialId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("material_requirements").insert({
            job_id: jobId,
            description: row.description,
            quantity: 0,
            actual_quantity: row.quantity,
            unit: row.unit || "Stk",
            source: EXECUTION_SOURCE,
            status: "Offen",
            sort_order: Date.now() % 1e9,
          });
          if (error) throw error;
        }
      }
      toast.success("KI-Vorschläge übernommen");
      setLabour([]);
      setMaterial([]);
      setPrompt("");
      qc.invalidateQueries({ queryKey: ["labour", jobId] });
      qc.invalidateQueries({ queryKey: ["labour_time_entries", jobId] });
      qc.invalidateQueries({ queryKey: ["materials", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Übernehmen fehlgeschlagen");
    }
  }

  const methodBtn = (id: "sprache" | "foto" | "text", icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium ${mode === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-3">
      <section className="space-y-4 rounded-xl border border-border/80 bg-card p-4">
        <div>
          <h3 className="text-lg font-semibold">Mit KI erfassen</h3>
          <p className="mt-1 text-sm text-muted-foreground">Einmal beschreiben – die KI ordnet IST-Stunden den Offertpositionen zu. Du prüfst und übernimmst.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {methodBtn("sprache", <Mic className="h-6 w-6" />, "Sprache", () => { setMode("sprache"); setVoiceOpen(true); })}
          {methodBtn("foto", <Camera className="h-6 w-6" />, "Foto", () => { setMode("foto"); images.openChooser(); })}
          {methodBtn("text", <FileText className="h-6 w-6" />, "Text", () => setMode("text"))}
        </div>
        {images.chooser}
        {mode === "text" && (
          <div className="space-y-2">
            <Textarea className="min-h-24 text-base" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="z.B. Demontage drei Stunden, Warmwasserleitung zweieinhalb Stunden, zusätzlich zwei Pressfittings…" />
            <Button className="h-12 w-full font-semibold" disabled={busy || !prompt.trim()} onClick={() => void analyze()}>
              <Sparkles className="h-4 w-4" /> {busy ? "Wird ausgewertet…" : "Auswerten"}
            </Button>
          </div>
        )}
        {mode === "sprache" && prompt && !voiceOpen && (
          <div className="space-y-2">
            <Field label="Transkript"><Textarea className="min-h-20 text-base" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
            <Button className="h-12 w-full font-semibold" disabled={busy || !prompt.trim()} onClick={() => void analyze()}>
              <Sparkles className="h-4 w-4" /> {busy ? "Wird ausgewertet…" : "Auswerten"}
            </Button>
          </div>
        )}
        {mode === "foto" && busy && <p className="text-sm text-muted-foreground">Foto wird ausgewertet…</p>}
      </section>

      {hasProposal && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">KI-Vorschläge</h3>
          <p className="text-sm font-medium text-primary">Entwurf – noch nicht gespeichert. Offerte-Stunden bleiben unverändert.</p>
          {labour.map((row, i) => (
            <label key={`l${i}`} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={row.keep} onChange={(e) => setLabour(labour.map((r, j) => j === i ? { ...r, keep: e.target.checked } : r))} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{row.extra ? "Zusatz: " : ""}{row.description}</p>
                <Field label="IST-Stunden"><Input className="h-11 text-base" type="number" inputMode="decimal" value={row.hours} onChange={(e) => setLabour(labour.map((r, j) => j === i ? { ...r, hours: Number(e.target.value) } : r))} /></Field>
                <Field label="Notiz"><Input className="h-11 text-base" value={row.note} onChange={(e) => setLabour(labour.map((r, j) => j === i ? { ...r, note: e.target.value } : r))} /></Field>
              </div>
            </label>
          ))}
          {material.map((row, i) => (
            <label key={`m${i}`} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={row.keep} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, keep: e.target.checked } : r))} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{row.materialId ? "Material IST" : "Zusatzmaterial"}: {row.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Menge"><Input className="h-11 text-base" type="number" inputMode="decimal" value={row.quantity} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, quantity: Number(e.target.value) } : r))} /></Field>
                  <Field label="Einheit"><Input className="h-11 text-base" value={row.unit} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} /></Field>
                </div>
              </div>
            </label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => { setLabour([]); setMaterial([]); }}><X className="h-4 w-4" /> Verwerfen</Button>
            <Button className="h-12 font-semibold" onClick={() => void apply()}><Check className="h-4 w-4" /> Übernehmen</Button>
          </div>
        </section>
      )}

      <Sheet open={voiceOpen} onOpenChange={setVoiceOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Sprache für KI</SheetTitle></SheetHeader>
          <div className="p-4 pt-0">
            {voiceOpen && (
              <VoiceRecorder
                onSave={async (_audio, transcript) => {
                  setPrompt(transcript);
                  setVoiceOpen(false);
                  setMode("sprache");
                }}
                onCancel={() => setVoiceOpen(false)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
