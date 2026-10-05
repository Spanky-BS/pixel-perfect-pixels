export type DocumentExtract =
  | { ok: true; text: string; kind: string }
  | { ok: false; kind: string; reason: string };

const MAX_CHARS = 80_000;
const MIN_PDF_CHARS = 80;

function asText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "").trim();
}

function clip(text: string) {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…` : text;
}

export function classifyDoc(fileName: string, mime?: string | null, fileType?: string | null) {
  const name = fileName.toLowerCase();
  const mimeL = (mime ?? "").toLowerCase();
  const type = (fileType ?? "").toLowerCase();
  if (type === "pdf" || mimeL.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type === "csv" || mimeL.includes("csv") || name.endsWith(".csv")) return "csv";
  if (type === "excel" || mimeL.includes("spreadsheet") || mimeL.includes("excel") || /\.xlsx?$/.test(name)) return "excel";
  if (type === "bild" || mimeL.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/.test(name)) return "image";
  return "other";
}

export async function extractDocumentBytes(
  bytes: Uint8Array,
  meta: { fileName: string; mimeType?: string | null; fileType?: string | null },
): Promise<DocumentExtract> {
  const kind = classifyDoc(meta.fileName, meta.mimeType, meta.fileType);
  if (kind === "csv") {
    const text = asText(bytes);
    if (!text) return { ok: false, kind, reason: "CSV ohne Text" };
    return { ok: true, kind, text: clip(text) };
  }
  if (kind === "excel") {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(bytes, { type: "array" });
      const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n] ?? {})).join("\n").trim();
      if (!text) return { ok: false, kind, reason: "Excel ohne lesbaren Inhalt" };
      return { ok: true, kind, text: clip(text) };
    } catch {
      return { ok: false, kind, reason: "Excel konnte nicht gelesen werden" };
    }
  }
  if (kind === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: true });
      const raw = Array.isArray(result.text) ? result.text.join("\n") : String(result.text ?? "");
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length < MIN_PDF_CHARS) return { ok: false, kind, reason: "PDF ohne ausreichenden Text (Scan?)" };
      return { ok: true, kind, text: clip(raw.trim()) };
    } catch {
      return { ok: false, kind, reason: "PDF-Text konnte nicht gelesen werden" };
    }
  }
  if (kind === "image") return { ok: false, kind, reason: "Bild" };
  return { ok: false, kind, reason: "Format wird nicht automatisch ausgewertet" };
}
