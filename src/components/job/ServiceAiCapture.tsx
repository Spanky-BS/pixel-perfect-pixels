import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check, X, Mic, Camera, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VoiceRecorder } from "@/components/job/VoiceRecorder";
import { useImageSourceChooser } from "@/components/ImageSourceChooser";
import { extractServiceCapture } from "@/lib/ai.functions";
import { settingsQuery } from "@/lib/queries";
import { VEHICLE_KIND, defaultTechnician, formatCHF } from "@/lib/app";
import { pickVehicleExtra } from "@/lib/service-billing";
import { hourlyRateFromSettings, MISSING_RATE } from "@/lib/commercial";

type LabourDraft = { keep: boolean; description: string; hours: number };
type MatDraft = { keep: boolean; description: string; quantity: number; unit: string; productId: string | null; productName: string | null; salesPrice: number };
type ExtraDraft = { keep: boolean; kind: string; description: string; amount: number };
type VehicleDraft = { keep: boolean; amount: number };

export function ServiceAiCapture({
  jobId,
  onPhotoFiles,
}: {
  jobId: string;
  onPhotoFiles: (files: FileList | File[] | null) => Promise<void> | void;
}) {
  const qc = useQueryClient();
  const run = useServerFn(extractServiceCapture);
  const settings = useQuery(settingsQuery());
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sprache" | "foto" | "text" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [labour, setLabour] = useState<LabourDraft[]>([]);
  const [material, setMaterial] = useState<MatDraft[]>([]);
  const [extras, setExtras] = useState<ExtraDraft[]>([]);
  const [vehicle, setVehicle] = useState<VehicleDraft | null>(null);
  const [notes, setNotes] = useState("");
  const [keepNotes, setKeepNotes] = useState(true);
  const hasProposal = labour.length + material.length + extras.length > 0 || !!vehicle || !!notes;

  async function analyze(opts?: { extraText?: string; usePhotos?: boolean }) {
    const extraText = opts?.extraText ?? prompt;
    setBusy(true);
    try {
      const r = await run({ data: { jobId, extraText: extraText || undefined, usePhotos: opts?.usePhotos } });
      if (!r.labour.length && !r.material.length && !r.extras.length && !r.vehicle && !r.notes) {
        toast.message("Nichts erkannt – Beschreibung ergänzen");
        return;
      }
      setLabour(r.labour.map((x) => ({ keep: true, description: x.description, hours: x.hours })));
      setMaterial(r.material.map((x) => ({
        keep: true,
        description: x.description,
        quantity: x.quantity,
        unit: x.unit,
        productId: x.productId,
        productName: x.productName,
        salesPrice: x.salesPrice ?? 0,
      })));
      setExtras(r.extras.map((x) => ({ keep: true, kind: x.kind, description: x.description, amount: x.amount })));
      const fee = r.vehicle?.apply ? r.vehicle.amount : null;
      setVehicle(fee != null ? { keep: true, amount: fee } : null);
      setNotes(r.notes);
      setKeepNotes(!!r.notes);
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

  function discardAll() {
    setLabour([]);
    setMaterial([]);
    setExtras([]);
    setVehicle(null);
    setNotes("");
  }

  async function apply() {
    const technician = defaultTechnician(settings.data);
    const rate = hourlyRateFromSettings(settings.data, "service");
    if (rate == null) {
      toast.error(MISSING_RATE);
      return;
    }
    try {
      for (const row of labour.filter((r) => r.keep)) {
        const { error } = await supabase.from("service_labour_entries").insert({
          job_id: jobId, description: row.description, hours: row.hours, hourly_rate: rate, technician,
        });
        if (error) throw error;
      }
      for (const row of material.filter((r) => r.keep)) {
        const { error } = await supabase.from("service_material_entries").insert({
          job_id: jobId, description: row.description, quantity: row.quantity, unit: row.unit, sales_price: row.salesPrice,
        });
        if (error) throw error;
      }
      for (const row of extras.filter((r) => r.keep)) {
        const { error } = await supabase.from("service_additional_costs").insert({
          job_id: jobId, kind: row.kind, description: row.description, quantity: 1, price: row.amount,
        });
        if (error) throw error;
      }
      if (vehicle?.keep) {
        const { data: existing } = await supabase.from("service_additional_costs").select("*").eq("job_id", jobId);
        const row = pickVehicleExtra((existing ?? []) as Record<string, unknown>[]);
        const id = row?.["id"];
        if (typeof id === "string") {
          const { error } = await supabase.from("service_additional_costs").update({
            kind: VEHICLE_KIND, description: VEHICLE_KIND, quantity: 1, price: vehicle.amount,
          }).eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("service_additional_costs").insert({
            job_id: jobId, kind: VEHICLE_KIND, description: VEHICLE_KIND, quantity: 1, price: vehicle.amount,
          });
          if (error) throw error;
        }
      }
      if (keepNotes && notes.trim()) {
        const { error } = await supabase.from("jobs").update({ completion_notes: notes.trim() }).eq("id", jobId);
        if (error) throw error;
      }
      toast.success("KI-Vorschläge übernommen");
      discardAll();
      qc.invalidateQueries({ queryKey: ["service_labour_entries", jobId] });
      qc.invalidateQueries({ queryKey: ["service_material_entries", jobId] });
      qc.invalidateQueries({ queryKey: ["service_additional_costs", jobId] });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Übernehmen fehlgeschlagen");
    }
  }

  const methodBtn = (id: "sprache" | "foto" | "text", icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors ${mode === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-border/80 bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">Vor Ort erfassen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Einmal erfassen – die KI strukturiert, du prüfst und übernimmst.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {methodBtn("sprache", <Mic className="h-6 w-6" />, "Sprache", () => { setMode("sprache"); setVoiceOpen(true); })}
          {methodBtn("foto", <Camera className="h-6 w-6" />, "Foto", () => { setMode("foto"); images.openChooser(); })}
          {methodBtn("text", <FileText className="h-6 w-6" />, "Text", () => setMode("text"))}
        </div>
        {images.chooser}
        {mode === "text" && (
          <div className="space-y-2">
            <Textarea className="min-h-24 text-base" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="z.B. 1,5 Stunden, Siphon ersetzt, 20 Franken Entsorgung…" />
            <Button className="h-12 w-full font-semibold" disabled={busy || !prompt.trim()} onClick={() => void analyze()}>
              <Sparkles className="h-4 w-4" /> {busy ? "Wird ausgewertet…" : "Auswerten"}
            </Button>
          </div>
        )}
        {mode === "sprache" && prompt && !voiceOpen && (
          <div className="space-y-2">
            <Field label="Transkript">
              <Textarea className="min-h-20 text-base" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </Field>
            <Button className="h-12 w-full font-semibold" disabled={busy || !prompt.trim()} onClick={() => void analyze()}>
              <Sparkles className="h-4 w-4" /> {busy ? "Wird ausgewertet…" : "Auswerten"}
            </Button>
          </div>
        )}
        {mode === "foto" && busy && <p className="text-sm text-muted-foreground">Foto wird ausgewertet…</p>}
      </section>

      {hasProposal && (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="section-title">KI-Vorschläge</h2>
          <p className="text-sm font-medium text-primary">Entwurf – noch nicht gespeichert</p>
          {labour.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Arbeit</h3>
              {labour.map((row, i) => (
                <DraftCard key={`l${i}`} keep={row.keep} onKeep={(k) => setLabour(labour.map((r, j) => j === i ? { ...r, keep: k } : r))}>
                  <Field label="Beschreibung"><Input className="h-11 text-base" value={row.description} onChange={(e) => setLabour(labour.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} /></Field>
                  <Field label="Stunden"><Input className="h-11 text-base" type="number" inputMode="decimal" step="0.25" value={row.hours} onChange={(e) => setLabour(labour.map((r, j) => j === i ? { ...r, hours: Number(e.target.value) } : r))} /></Field>
                  <p className="text-xs text-muted-foreground">Techniker {defaultTechnician(settings.data)} · {hourlyRateFromSettings(settings.data, "service") == null ? "Ansatz in Einstellungen" : `${formatCHF(hourlyRateFromSettings(settings.data, "service") ?? 0)}/h`}</p>
                </DraftCard>
              ))}
            </div>
          )}
          {material.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Material</h3>
              {material.map((row, i) => (
                <DraftCard key={`m${i}`} keep={row.keep} onKeep={(k) => setMaterial(material.map((r, j) => j === i ? { ...r, keep: k } : r))}>
                  <Field label="Beschreibung"><Input className="h-11 text-base" value={row.description} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Menge"><Input className="h-11 text-base" type="number" inputMode="decimal" value={row.quantity} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, quantity: Number(e.target.value) } : r))} /></Field>
                    <Field label="Einheit"><Input className="h-11 text-base" value={row.unit} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} /></Field>
                  </div>
                  <Field label="VK CHF"><Input className="h-11 text-base" type="number" inputMode="decimal" value={row.salesPrice} onChange={(e) => setMaterial(material.map((r, j) => j === i ? { ...r, salesPrice: Number(e.target.value) } : r))} /></Field>
                  {row.productName && <p className="text-xs text-muted-foreground">Bibliothek: {row.productName}</p>}
                </DraftCard>
              ))}
            </div>
          )}
          {vehicle && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Fahrzeugpauschale</h3>
              <DraftCard keep={vehicle.keep} onKeep={(k) => setVehicle({ ...vehicle, keep: k })}>
                <Field label="Betrag CHF"><Input className="h-11 text-base" type="number" inputMode="decimal" value={vehicle.amount} onChange={(e) => setVehicle({ ...vehicle, amount: Number(e.target.value) })} /></Field>
              </DraftCard>
            </div>
          )}
          {extras.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Zusatzkosten</h3>
              {extras.map((row, i) => (
                <DraftCard key={`e${i}`} keep={row.keep} onKeep={(k) => setExtras(extras.map((r, j) => j === i ? { ...r, keep: k } : r))}>
                  <Field label="Art"><Input className="h-11 text-base" value={row.kind} onChange={(e) => setExtras(extras.map((r, j) => j === i ? { ...r, kind: e.target.value } : r))} /></Field>
                  <Field label="Beschreibung"><Input className="h-11 text-base" value={row.description} onChange={(e) => setExtras(extras.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} /></Field>
                  <Field label="Betrag CHF"><Input className="h-11 text-base" type="number" inputMode="decimal" value={row.amount} onChange={(e) => setExtras(extras.map((r, j) => j === i ? { ...r, amount: Number(e.target.value) } : r))} /></Field>
                </DraftCard>
              ))}
            </div>
          )}
          {notes ? (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Notizen</h3>
              <DraftCard keep={keepNotes} onKeep={setKeepNotes}>
                <Textarea className="min-h-20 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </DraftCard>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={discardAll}><X className="h-4 w-4" /> Verwerfen</Button>
            <Button className="h-12 font-semibold" onClick={() => void apply()}><Check className="h-4 w-4" /> Vorschläge übernehmen</Button>
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

function DraftCard({ keep, onKeep, children }: { keep: boolean; onKeep: (k: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${keep ? "bg-background" : "bg-muted/50 opacity-60"}`}>
      <div className="flex gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">KI-Vorschlag</span>
        <button type="button" className="ml-auto h-9 rounded-lg border px-3 text-sm font-semibold" onClick={() => onKeep(true)}>{keep ? "Übernehmen" : "Wiederherstellen"}</button>
        <button type="button" className="h-9 rounded-lg border px-3 text-sm font-semibold text-destructive" onClick={() => onKeep(false)}>Verwerfen</button>
      </div>
      {children}
    </div>
  );
}
