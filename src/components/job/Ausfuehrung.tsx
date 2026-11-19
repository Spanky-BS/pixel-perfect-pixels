import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Check, FileText, Mic, Plus, Sparkles, Trash2, X } from "lucide-react";
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
import { SupplierSearch } from "@/components/job/SupplierSearch";
import { addCatalogHitAsExtraMaterial } from "@/lib/suppliers/add-to-offer";

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
  const [timeFor, setTimeFor] = useState<"day" | "extra" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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

  const quotedHours = quoted.reduce((s, l) => s + Number(l.hours), 0);
  const workedHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const diff = workedHours - quotedHours;
  const offerMaterials = (materials.data ?? []).filter((m) => m.source !== EXECUTION_SOURCE);
  const extraMaterials = (materials.data ?? []).filter((m) => m.source === EXECUTION_SOURCE);
  const extraIds = new Set(extra.map((l) => l.id));
  const fmtH = (n: number) => `${n.toLocaleString("de-CH", { maximumFractionDigits: 2 })} h`;

  async function removeEntry(id: string) {
    await supabase.from("labour_time_entries").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["labour_time_entries", jobId] });
  }

  async function removeMaterial(id: string) {
    if (!confirm("Zusatzmaterial entfernen?")) return;
    await supabase.from("material_requirements").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["materials", jobId] });
  }

  const qtyEditor = (m: Material) => (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`Menge ${m.description}`}
        className="h-11 w-20 text-right text-base tabular"
        type="number"
        inputMode="decimal"
        value={actualQty[m.id] ?? String(m.actual_quantity ?? m.quantity)}
        onChange={(e) => setActualQty((s) => ({ ...s, [m.id]: e.target.value }))}
        onBlur={() => actualQty[m.id] != null && actualQty[m.id] !== String(m.actual_quantity ?? m.quantity) && void saveActualQty(m)}
      />
      <span className="w-8 text-sm text-muted-foreground">{m.unit}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Ausführung</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Arbeitszeit pro Einsatz erfassen. Verrechnet wird die Offerte – nachverrechnet nur Zusatzarbeit und Zusatzmaterial.</p>
      </div>

      <section className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-center">
        <div><p className="text-xs text-muted-foreground">Offeriert</p><p className="text-lg font-semibold tabular">{fmtH(quotedHours)}</p></div>
        <div><p className="text-xs text-muted-foreground">Gearbeitet</p><p className="text-lg font-semibold tabular">{fmtH(workedHours)}</p></div>
        <div>
          <p className="text-xs text-muted-foreground">Differenz</p>
          <p className={`text-lg font-semibold tabular ${diff > 0 ? "text-destructive" : "text-primary"}`}>{diff > 0 ? "+" : ""}{fmtH(diff)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <Button className="h-14 w-full gap-2 text-base font-semibold" onClick={() => setTimeFor("day")}>
          <Plus className="h-5 w-5" /> Arbeitszeit erfassen
        </Button>
        {!entries.length && <p className="text-sm text-muted-foreground">Noch keine Einsätze erfasst.</p>}
        {entries.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {e.worked_on ? formatDate(e.worked_on) : "Ohne Datum"} · {e.technician || technician} · <span className="tabular">{fmtH(Number(e.hours))}</span>
                    {e.labour_item_id && extraIds.has(e.labour_item_id) && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-primary">Nachverrechnen</span>}
                  </p>
                  {(e.labour_item_id && extraIds.has(e.labour_item_id)) && <p className="text-sm">{extra.find((l) => l.id === e.labour_item_id)?.description}</p>}
                  {e.notes?.trim() && <p className="text-sm text-muted-foreground">{e.notes}</p>}
                </div>
                <button type="button" aria-label="Eintrag löschen" className="flex h-10 w-10 shrink-0 items-center justify-center text-destructive" onClick={() => void removeEntry(e.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-3">
        <div>
          <h3 className="text-base font-semibold">Nachverrechnen</h3>
          <p className="text-sm text-muted-foreground">Nur grössere Zusatzarbeiten und Mehrmaterial – kommt auf die Schlussrechnung.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={() => setTimeFor("extra")}><Plus className="h-4 w-4" /> Zusatzarbeit</Button>
          <Button variant="outline" className="h-12" onClick={() => setSearchOpen(true)}><Plus className="h-4 w-4" /> Zusatzmaterial</Button>
        </div>
        {extra.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {extra.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 font-medium">{l.description || "–"}</span>
                <span className="tabular">{fmtH(istHours(l.id))}</span>
              </li>
            ))}
          </ul>
        )}
        {extraMaterials.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {extraMaterials.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{m.description || "–"}</span>
                {qtyEditor(m)}
                <button type="button" aria-label="Entfernen" className="flex h-10 w-8 items-center justify-center text-destructive" onClick={() => void removeMaterial(m.id)}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {offerMaterials.length > 0 && (
        <details className="rounded-xl border bg-card">
          <summary className="flex h-12 cursor-pointer items-center justify-between px-3 text-sm font-semibold">
            <span>Material aus Offerte ({offerMaterials.length})</span>
            <span className="text-xs font-normal text-muted-foreground">wie offeriert · nur Abweichungen ändern</span>
          </summary>
          <ul className="divide-y border-t">
            {offerMaterials.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{m.description || "–"}<span className="block text-xs text-muted-foreground">Offerte {Number(m.quantity)} {m.unit}</span></span>
                {qtyEditor(m)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="space-y-3">
        <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium" onClick={onAddPhoto}>
          <Camera className="h-4 w-4" /> Foto
        </button>
        <PhotoGallery jobId={jobId} variant="service" title="Fotos & Dokumentation" />
        <NotesList jobId={jobId} hideEmpty />
        <DocumentList jobId={jobId} hideEmpty />
      </section>

      <SupplierSearch
        open={searchOpen}
        title="Zusatzmaterial"
        onClose={() => setSearchOpen(false)}
        footer={
          <button type="button" onClick={() => { setSearchOpen(false); onEditMaterial({ job_id: jobId, quantity: 0, actual_quantity: 1, unit: "Stk", status: "Offen", source: EXECUTION_SOURCE }); }} className="h-11 w-full rounded-xl border border-dashed border-border text-sm font-medium text-primary">Manuell erfassen (ohne Katalog)</button>
        }
        onPick={async (hit) => {
          try {
            await addCatalogHitAsExtraMaterial(jobId, hit, 1);
            toast.success("Zusatzmaterial erfasst – Menge anpassen falls nötig");
            qc.invalidateQueries({ queryKey: ["materials", jobId] });
            setSearchOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Übernehmen fehlgeschlagen");
          }
        }}
      />

      {timeFor && (
        <TimeEntrySheet
          jobId={jobId}
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
  extra,
  technician,
  onClose,
}: {
  jobId: string;
  extra: boolean;
  technician: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(extra ? "1" : "8");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tech, setTech] = useState(technician);
  const [saving, setSaving] = useState(false);

  async function save() {
    const h = Number(hours.replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) return toast.error("Stunden angeben");
    setSaving(true);
    try {
      let labourId: string | null = null;
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
      toast.success(extra ? "Zusatzarbeit erfasst" : "Arbeitszeit erfasst");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader><SheetTitle>{extra ? "Zusatzarbeit nachverrechnen" : "Arbeitszeit erfassen"}</SheetTitle></SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          {extra && <Field label="Was wurde zusätzlich gemacht?"><Input className="h-12 text-base" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z.B. Zusatzanschluss im Keller auf Kundenwunsch" /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stunden"><Input className="h-12 text-base" type="number" inputMode="decimal" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            <Field label="Datum"><Input className="h-12 text-base" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Techniker"><Input className="h-12 text-base" value={tech} onChange={(e) => setTech(e.target.value)} /></Field>
          <Field label={extra ? "Notiz (optional)" : "Kurzer Rapport (optional)"}>
            <Textarea className="min-h-20 text-base" value={note} onChange={(e) => setNote(e.target.value)} placeholder={extra ? "" : "z.B. Altes Bad demontiert, Vorwand gestellt"} />
          </Field>
          <Button className="h-12 w-full font-semibold" disabled={saving} onClick={() => void save()}>Speichern</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProjectExecutionCapture({
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
