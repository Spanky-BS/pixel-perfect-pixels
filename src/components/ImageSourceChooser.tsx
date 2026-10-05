import { useRef, useState } from "react";
import { Camera, ImagePlus, FileUp } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type ImageSourceChooserProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onPickFile?: () => void;
};

export function ImageSourceChooser({
  open,
  onOpenChange,
  onPickCamera,
  onPickGallery,
  onPickFile,
}: ImageSourceChooserProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader><SheetTitle>Bildquelle wählen</SheetTitle></SheetHeader>
        <div className="space-y-2 p-4 pt-0">
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            onClick={() => { onPickCamera(); onOpenChange(false); }}
          >
            <Camera className="h-5 w-5" /> Foto aufnehmen
          </button>
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold"
            onClick={() => { onPickGallery(); onOpenChange(false); }}
          >
            <ImagePlus className="h-5 w-5 text-primary" /> Aus Galerie wählen
          </button>
          {onPickFile && (
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold"
              onClick={() => { onPickFile(); onOpenChange(false); }}
            >
              <FileUp className="h-5 w-5 text-primary" /> Datei wählen
            </button>
          )}
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
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => take(e.target, e.target.files, (files) => onImage(files, "camera"))}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple={multipleImages}
          className="hidden"
          onChange={(e) => take(e.target, e.target.files, (files) => onImage(files, "gallery"))}
        />
        {onFile && (
          <input
            ref={fileRef}
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
          {...(onFile ? { onPickFile: () => { fileRef.current?.click(); } } : {})}
        />
      </>
    ),
  };
}
