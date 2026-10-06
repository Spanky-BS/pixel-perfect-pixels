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
import { useImageSourceChooser } from "@/components/ImageSourceChooser";
import { BUCKET, DEFAULT_SERVICE_PHOTO_CATEGORY, PHOTO_CATEGORIES, SERVICE_PHOTO_CATEGORIES, formatDate, servicePhotoCategory, signedUrls, uploadMedia, type JobDocument, type JobPhoto, type VoiceNote } from "@/lib/app";

export function usePhotoUpload(jobId: string, opts?: {
  defaultCategory?: string | null;
  onUploaded?: (ids: string[]) => void;
}) {
  const qc = useQueryClient();
  return async (files: FileList | File[] | null) => {
    if (!files || !("length" in files) || !files.length) return;
    const list = Array.from(files);
    const t = toast.loading(`${list.length} Foto(s) werden hochgeladen…`);
    try {
      const ids: string[] = [];
      for (const file of list) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = await uploadMedia(jobId, file, ext);
        const { data, error } = await supabase.from("job_photos").insert({
          job_id: jobId,
          storage_path: path,
          category: opts?.defaultCategory ?? null,
          taken_at: new Date(file.lastModified || Date.now()).toISOString(),
        }).select("id").single();
        if (error) throw error;
        if (data?.id) ids.push(data.id);
      }
      toast.success("Fotos gespeichert", { id: t });
      qc.invalidateQueries({ queryKey: ["photos", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      if (ids.length) opts?.onUploaded?.(ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen", { id: t });
    }
  };
}

export function PhotoAssignSheet({
  jobId,
  photoIds,
  onClose,
}: {
  jobId: string;
  photoIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [cats, setCats] = useState<Record<string, string>>({});
  const photos = useQuery({
    queryKey: ["photos-assign", jobId, photoIds.join(",")],
    enabled: photoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_photos").select("*").in("id", photoIds);
      if (error) throw error;
      const urls = await signedUrls(data.map((p) => p.storage_path));
      return data.map((p) => ({ ...p, url: urls[p.storage_path] }));
    },
  });

  async function save() {
    for (const id of photoIds) {
      const category = cats[id] ?? DEFAULT_SERVICE_PHOTO_CATEGORY;
      await supabase.from("job_photos").update({ category }).eq("id", id);
    }
    qc.invalidateQueries({ queryKey: ["photos", jobId] });
    onClose();
  }

  return (
    <Sheet open={photoIds.length > 0} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>Foto zuordnen</SheetTitle></SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          {(photos.data ?? []).map((p) => {
            const current = cats[p.id] ?? p.category ?? DEFAULT_SERVICE_PHOTO_CATEGORY;
            return (
              <div key={p.id} className="space-y-2">
                {p.url && <img src={p.url} alt="" className="h-36 w-full rounded-lg object-cover bg-muted" />}
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_PHOTO_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCats((s) => ({ ...s, [p.id]: c }))}
                      className={`h-11 rounded-lg border text-sm font-semibold ${current === c ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <Button className="h-12 w-full font-semibold" onClick={() => void save()}>Zuordnung speichern</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function classifyUpload(file: File) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "Bild";
  if (ext === "pdf" || file.type === "application/pdf") return "PDF";
  if (["xlsx", "xls"].includes(ext)) return "Excel";
  if (ext === "csv") return "CSV";
  return ext ? ext.toUpperCase() : "Datei";
}

export function useDocumentUpload(jobId: string) {
  const qc = useQueryClient();
  return async (files: FileList | null) => {
    if (!files?.length) return;
    const t = toast.loading(`${files.length} Datei(en) werden hochgeladen…`);
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = await uploadMedia(jobId, file, ext);
        const { error } = await supabase.from("job_documents").insert({
          job_id: jobId,
          storage_path: path,
          file_name: file.name,
          file_type: classifyUpload(file),
          mime_type: file.type || null,
        });
        if (error) throw error;
      }
      toast.success("Unterlagen gespeichert", { id: t });
      qc.invalidateQueries({ queryKey: ["documents", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen", { id: t });
    }
  };
}

export function PhotoGallery({
  jobId,
  variant = "project",
  filterCategories,
  title,
  hideEmpty,
}: {
  jobId: string;
  variant?: "project" | "service";
  filterCategories?: string[];
  title?: string;
  hideEmpty?: boolean;
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<JobPhoto | null>(null);
  const catOptions = variant === "service" ? [...SERVICE_PHOTO_CATEGORIES] : PHOTO_CATEGORIES;
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

  const all = photos.data ?? [];
  const list = filterCategories
    ? all.filter((p) => filterCategories.includes(variant === "service" ? servicePhotoCategory(p.category) : (p.category ?? "")))
    : all;
  const editing = all.find((p) => p.id === edit?.id);

  function tile(p: typeof list[number]) {
    const label = variant === "service" ? servicePhotoCategory(p.category) : p.category;
    return (
      <button key={p.id} onClick={() => setEdit(p)} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
        {p.url && <img src={p.url} alt={p.description ?? "Foto"} loading="lazy" className="h-full w-full object-cover" />}
        {label && <span className="absolute left-1 top-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold">{label}</span>}
        <span className="absolute inset-x-0 bottom-0 bg-foreground/60 px-1 py-0.5 text-[10px] text-background">{formatDate(p.taken_at, true)}</span>
      </button>
    );
  }

  return (
    <section className="space-y-3">
      {!(hideEmpty && !list.length) && <h2 className="section-title">{title ?? `Fotos (${list.length})`}</h2>}
      {!list.length && !hideEmpty && <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Noch keine Fotos.</p>}
      {variant === "service" && !filterCategories ? (
        SERVICE_PHOTO_CATEGORIES.map((group) => {
          const items = list.filter((p) => servicePhotoCategory(p.category) === group);
          if (!items.length) return null;
          return (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-bold">{group}</h3>
              <div className="grid grid-cols-3 gap-2">{items.map(tile)}</div>
            </div>
          );
        })
      ) : (
        <div className="grid grid-cols-3 gap-2">{list.map(tile)}</div>
      )}
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
                  {catOptions.map((c) => (
                    <button key={c} onClick={() => setEdit({ ...edit, category: c })}
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

export function NotesList({ jobId, hideEmpty }: { jobId: string; hideEmpty?: boolean }) {
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
  if (hideEmpty && !list.length) return null;
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

export function useFileInputs({
  onCamera,
  onDocuments,
}: {
  onCamera: (f: FileList | File[] | null) => void;
  onDocuments: (f: FileList | null) => void;
}) {
  const images = useImageSourceChooser({ onImage: onCamera, multipleImages: true });
  const upload = useRef<HTMLInputElement>(null);
  return {
    openCamera: images.openChooser,
    openUpload: () => upload.current?.click(),
    inputs: (
      <>
        {images.chooser}
        <input
          ref={upload}
          type="file"
          multiple
          accept="image/*,.pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => { onDocuments(e.target.files); e.target.value = ""; }}
        />
      </>
    ),
  };
}

export function DocumentList({ jobId, hideEmpty }: { jobId: string; hideEmpty?: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<JobDocument | null>(null);
  const docs = useQuery({
    queryKey: ["documents", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_documents").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrls(data.map((d) => d.storage_path));
      return data.map((d) => ({ ...d, url: urls[d.storage_path] }));
    },
  });

  async function save() {
    if (!edit) return;
    await supabase.from("job_documents").update({ description: edit.description }).eq("id", edit.id);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["documents", jobId] });
  }
  async function remove(d: JobDocument) {
    if (!confirm("Unterlage löschen?")) return;
    await supabase.storage.from(BUCKET).remove([d.storage_path]);
    await supabase.from("job_documents").delete().eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["documents", jobId] });
  }

  const list = docs.data ?? [];
  if (hideEmpty && !list.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="section-title">Unterlagen ({list.length})</h2>
      {!list.length && <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Noch keine Dateien. Fotos, Screenshots, PDF oder Excel hier ablegen.</p>}
      {list.map((d) => (
        <div key={d.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{d.file_name}</div>
              <div className="text-sm text-muted-foreground">{d.file_type} · {formatDate(d.created_at, true)}</div>
              {d.description && <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>}
            </div>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{d.file_type}</span>
          </div>
          <div className="mt-2 flex gap-2">
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center rounded-lg border text-sm font-semibold">
                Öffnen
              </a>
            )}
            <button className="flex h-10 flex-1 items-center justify-center rounded-lg border text-sm font-semibold" onClick={() => setEdit(d)}>Beschreibung</button>
            <button className="flex h-10 w-10 items-center justify-center rounded-lg border text-destructive" aria-label="Löschen" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Beschreibung</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 p-4 pt-0">
              <p className="text-sm font-medium">{edit.file_name}</p>
              <Input className="h-12 text-base" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="z.B. Kunden-PDF Armaturen" />
              <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function SourceFilesSheet({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>Unterlagen</SheetTitle></SheetHeader>
        <div className="space-y-6 p-4 pt-0">
          <p className="text-sm text-muted-foreground">Quellen aus der Begehung. Uploads nur dort – hier nur ansehen.</p>
          <DocumentList jobId={jobId} />
          <PhotoGallery jobId={jobId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
