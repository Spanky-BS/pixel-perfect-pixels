import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, FileUp } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type ImageSourceChooserProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onPickFile?: () => void;
  cameraId?: string;
  galleryId?: string;
  fileId?: string;
};

export function ImageSourceChooser({
  open,
  onOpenChange,
  onPickCamera,
  onPickGallery,
  onPickFile,
  cameraId,
  galleryId,
  fileId,
}: ImageSourceChooserProps) {
  const cls = "flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold";
  // Native <label htmlFor> taps open the iPhone camera directly (no JS click, which iOS may block).
  const close = () => setTimeout(() => onOpenChange(false), 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader><SheetTitle>Bildquelle wählen</SheetTitle></SheetHeader>
        <div className="space-y-2 p-4 pt-0">
          {cameraId ? (
            <label htmlFor={cameraId} className={`${cls} bg-primary text-primary-foreground`} onClick={close}>
              <Camera className="h-5 w-5" /> Foto aufnehmen
            </label>
          ) : (
            <button type="button" className={`${cls} bg-primary text-primary-foreground`} onClick={() => { onPickCamera(); onOpenChange(false); }}>
              <Camera className="h-5 w-5" /> Foto aufnehmen
            </button>
          )}
          {galleryId ? (
            <label htmlFor={galleryId} className={`${cls} border bg-card`} onClick={close}>
              <ImagePlus className="h-5 w-5 text-primary" /> Aus Galerie wählen
            </label>
          ) : (
            <button type="button" className={`${cls} border bg-card`} onClick={() => { onPickGallery(); onOpenChange(false); }}>
              <ImagePlus className="h-5 w-5 text-primary" /> Aus Galerie wählen
            </button>
          )}
          {onPickFile && (fileId ? (
            <label htmlFor={fileId} className={`${cls} border bg-card`} onClick={close}>
              <FileUp className="h-5 w-5 text-primary" /> Datei wählen
            </label>
          ) : (
            <button type="button" className={`${cls} border bg-card`} onClick={() => { onPickFile(); onOpenChange(false); }}>
              <FileUp className="h-5 w-5 text-primary" /> Datei wählen
            </button>
          ))}
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-lg text-sm font-semibold text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function useImageSourceChooser({
  onImage,
  onFile,
  fileAccept,
  multipleImages = true,
}: {
  onImage: (files: FileList | File[] | null, source: "camera" | "gallery") => void;
  onFile?: (files: FileList | File[] | null) => void;
  fileAccept?: string;
  multipleImages?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const uid = useId().replace(/:/g, "");
  const ids = { camera: `cam-${uid}`, gallery: `gal-${uid}`, file: `file-${uid}` };
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function take(el: HTMLInputElement | null, files: FileList | null, handler: (f: FileList | null) => void) {
    handler(files);
    if (el) el.value = "";
  }

  return {
    openChooser: () => setOpen(true),
    chooser: (
      <>
        <input
          ref={cameraRef}
          id={ids.camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => take(e.target, e.target.files, (files) => onImage(files, "camera"))}
        />
        <input
          ref={galleryRef}
          id={ids.gallery}
          type="file"
          accept="image/*"
          multiple={multipleImages}
          className="hidden"
          onChange={(e) => take(e.target, e.target.files, (files) => onImage(files, "gallery"))}
        />
        {onFile && (
          <input
            ref={fileRef}
            id={ids.file}
            type="file"
            accept={fileAccept || "*/*"}
            className="hidden"
            onChange={(e) => take(e.target, e.target.files, onFile)}
          />
        )}
        <ImageSourceChooser
          open={open}
          onOpenChange={(v) => setOpen(v)}
          onPickCamera={() => { cameraRef.current?.click(); }}
          onPickGallery={() => { galleryRef.current?.click(); }}
          cameraId={ids.camera}
          galleryId={ids.gallery}
          {...(onFile ? { fileId: ids.file } : {})}
          {...(onFile ? { onPickFile: () => { fileRef.current?.click(); } } : {})}
        />
      </>
    ),
  };
}
