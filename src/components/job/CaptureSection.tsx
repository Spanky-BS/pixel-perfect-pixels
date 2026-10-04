import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, FileText, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "./VoiceRecorder";
import { BUCKET, PHOTO_CATEGORIES, formatDate, signedUrls, uploadMedia, type JobPhoto, type VoiceNote } from "@/lib/app";

export function usePhotoUpload(jobId: string) {
  const qc = useQueryClient();
  return async (files: FileList | null) => {
    if (!files?.length) return;
    const t = toast.loading(`${files.length} Foto(s) werden hochgeladen…`);
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = await uploadMedia(jobId, file, ext);
        const { error } = await supabase.from("job_photos").insert({
          job_id: jobId,
          storage_path: path,
          taken_at: new Date(file.lastModified || Date.now()).toISOString(),
        });
        if (error) throw error;
      }
      toast.success("Fotos gespeichert", { id: t });
      qc.invalidateQueries({ queryKey: ["photos", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen", { id: t });
    }
  };
}

export function PhotoGallery({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<JobPhoto | null>(null);
  const photos = useQuery({
    queryKey: ["photos", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_photos").select("*").eq("job_id", jobId).order("taken_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrls(data.map((p) => p.storage_path));
      return data.map((p) => ({ ...p, url: urls[p.storage_path] }));
    },
  });

  async function saveEdit() {
    if (!edit) return;
    await supabase.from("job_photos").update({ description: edit.description, category: edit.category }).eq("id", edit.id);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["photos", jobId] });
  }
  async function remove() {
    if (!edit || !confirm("Foto löschen?")) return;
    await supabase.storage.from(BUCKET).remove([edit.storage_path]);
    await supabase.from("job_photos").delete().eq("id", edit.id);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["photos", jobId] });
  }

  const list = photos.data ?? [];
  const editing = list.find((p) => p.id === edit?.id);

  return (
    <section className="space-y-3">
      <h2 className="section-title">Fotos ({list.length})</h2>
      {!list.length && <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Noch keine Fotos.</p>}
      <div className="grid grid-cols-3 gap-2">
        {list.map((p) => (
          <button key={p.id} onClick={() => setEdit(p)} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
            {p.url && <img src={p.url} alt={p.description ?? "Foto"} loading="lazy" className="h-full w-full object-cover" />}
            {p.category && <span className="absolute left-1 top-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold">{p.category}</span>}
            <span className="absolute inset-x-0 bottom-0 bg-foreground/60 px-1 py-0.5 text-[10px] text-background">{formatDate(p.taken_at, true)}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Foto</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-4 p-4 pt-0">
              {editing?.url && <img src={editing.url} alt="" className="max-h-[45vh] w-full rounded-lg object-contain bg-muted" />}
              <p className="text-sm text-muted-foreground">{formatDate(edit.taken_at, true)}</p>
              <div>
                <label className="field-label">Kategorie</label>
                <div className="flex flex-wrap gap-2">
                  {PHOTO_CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setEdit({ ...edit, category: edit.category === c ? null : c })}
                      className={`h-10 rounded-full border px-3 text-sm ${edit.category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Beschreibung</label>
                <Input className="h-12 text-base" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <Button variant="outline" className="h-12 text-destructive" onClick={remove}><Trash2 className="h-5 w-5" /></Button>
                <Button className="h-12 font-semibold" onClick={saveEdit}>Speichern</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function NotesList({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<VoiceNote | null>(null);
  const notes = useQuery({
    queryKey: ["notes", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_notes").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrls(data.filter((n) => n.storage_path).map((n) => n.storage_path!));
      return data.map((n) => ({ ...n, url: n.storage_path ? urls[n.storage_path] : undefined }));
    },
  });

  async function save() {
    if (!edit) return;
    await supabase.from("voice_notes").update({ transcript: edit.transcript }).eq("id", edit.id);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["notes", jobId] });
  }
  async function remove(n: VoiceNote) {
    if (!confirm("Notiz löschen?")) return;
    if (n.storage_path) await supabase.storage.from(BUCKET).remove([n.storage_path]);
    await supabase.from("voice_notes").delete().eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notes", jobId] });
  }

  const list = notes.data ?? [];
  return (
    <section className="space-y-3">
      <h2 className="section-title">Notizen & Sprachaufnahmen ({list.length})</h2>
      {!list.length && <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Noch keine Notizen.</p>}
      {list.map((n) => (
        <div key={n.id} className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {n.kind === "voice" ? <Mic className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {n.kind === "voice" ? "Sprachnotiz" : "Textnotiz"} · {formatDate(n.created_at, true)}
            </span>
            <div className="flex">
              <button className="flex h-10 w-10 items-center justify-center text-muted-foreground" onClick={() => setEdit(n)} aria-label="Bearbeiten"><Pencil className="h-4 w-4" /></button>
              <button className="flex h-10 w-10 items-center justify-center text-destructive" onClick={() => remove(n)} aria-label="Löschen"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          {n.url && <audio controls src={n.url} className="mb-2 w-full" preload="none" />}
          <p className="whitespace-pre-wrap text-sm">{n.transcript || <span className="text-muted-foreground">Kein Transkript – tippen Sie auf Bearbeiten.</span>}</p>
        </div>
      ))}
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>{edit?.kind === "voice" ? "Transkript bearbeiten" : "Notiz bearbeiten"}</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 p-4 pt-0">
              <Textarea autoFocus className="min-h-40 text-base" value={edit.transcript ?? ""} onChange={(e) => setEdit({ ...edit, transcript: e.target.value })} />
              <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function useCaptureSheets(jobId: string) {
  const qc = useQueryClient();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [text, setText] = useState("");

  async function saveVoice(audio: Blob | null, transcript: string, seconds: number) {
    try {
      let path: string | null = null;
      if (audio && audio.size) path = await uploadMedia(jobId, audio, audio.type.includes("webm") ? "webm" : "m4a");
      const { error } = await supabase.from("voice_notes").insert({ job_id: jobId, kind: "voice", storage_path: path, transcript, duration_seconds: seconds });
      if (error) throw error;
      toast.success("Sprachnotiz gespeichert");
      setVoiceOpen(false);
      qc.invalidateQueries({ queryKey: ["notes", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function saveText() {
    if (!text.trim()) return;
    const { error } = await supabase.from("voice_notes").insert({ job_id: jobId, kind: "text", transcript: text.trim() });
    if (error) return toast.error(error.message);
    setText("");
    setTextOpen(false);
    qc.invalidateQueries({ queryKey: ["notes", jobId] });
  }

  const sheets = (
    <>
      <Sheet open={voiceOpen} onOpenChange={setVoiceOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Spracheingabe</SheetTitle></SheetHeader>
          <div className="p-4 pt-0">{voiceOpen && <VoiceRecorder onSave={saveVoice} onCancel={() => setVoiceOpen(false)} />}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={textOpen} onOpenChange={setTextOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Textnotiz</SheetTitle></SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <Textarea autoFocus className="min-h-40 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Beobachtungen, Masse, Wünsche des Kunden…" />
            <Button className="h-12 w-full font-semibold" onClick={saveText}>Speichern</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
  return { openVoice: () => setVoiceOpen(true), openText: () => setTextOpen(true), sheets };
}

export function HiddenFileInputs({ onFiles }: { onFiles: (f: FileList | null) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  return {
    openCamera: () => camera.current?.click(),
    openUpload: () => upload.current?.click(),
    inputs: (
      <>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <input ref={upload} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </>
    ),
  };
}
