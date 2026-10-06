/** Client-only: renders a DOM element into a real A4 PDF file (loaded lazily). */
export async function elementToPdf(el: HTMLElement, filename: string): Promise<File> {
  const { default: html2pdf } = await import("html2pdf.js");
  const blob: Blob = await html2pdf()
    .set(({
      margin: [10, 10, 12, 10],
      filename: `${filename}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".sr-tot", ".sr-sig"] },
    }) as Parameters<ReturnType<typeof html2pdf>["set"]>[0])
    .from(el)
    .outputPdf("blob");
  return new File([blob], `${filename}.pdf`, { type: "application/pdf" });
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Share via iOS share sheet (Mail, WhatsApp…) or fall back to download. */
export async function shareOrDownload(file: File, title: string) {
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "aborted" as const;
    }
  }
  downloadFile(file);
  return "downloaded" as const;
}
