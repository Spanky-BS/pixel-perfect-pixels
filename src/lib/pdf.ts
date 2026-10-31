// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdf = any;

/** Client-only: renders a DOM element into a real A4 PDF file (loaded lazily). `after` can add pages (e.g. QR slip). */
export async function elementToPdf(el: HTMLElement, filename: string, after?: (pdf: JsPdf) => Promise<void> | void): Promise<File> {
  const { default: html2pdf } = await import("html2pdf.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: any = html2pdf()
    .set(({
      margin: [10, 10, 12, 10],
      filename: `${filename}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".sr-tot", ".sr-sig"] },
    }) as Record<string, unknown>)
    .from(el);
  if (after) worker = worker.toPdf().get("pdf").then((pdf: JsPdf) => after(pdf));
  const blob: Blob = await worker.outputPdf("blob");
  return new File([blob], `${filename}.pdf`, { type: "application/pdf" });
}

/** Adds the Swiss QR payment part (210 × 105 mm) at the bottom of a new A4 page. */
export async function appendQrBillPage(pdf: JsPdf, svg: string, heading: string) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 2480; // 300 dpi over 210 mm
  canvas.height = 1240;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  pdf.addPage("a4", "portrait");
  pdf.setFontSize(11);
  pdf.text(heading, 15, 20);
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 192, 210, 105);
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
