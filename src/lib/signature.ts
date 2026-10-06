/** Crop empty / near-white margin so handwriting fills the signature box. Falls back to the original URL. */
export async function trimSignatureImage(src: string): Promise<string> {
  try {
    const blob = await (await fetch(src)).blob();
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (canvas.width < 2 || canvas.height < 2) return src;
      const ctx = canvas.getContext("2d");
      if (!ctx) return src;
      ctx.drawImage(img, 0, 0);
      const cropped = cropCanvasInk(canvas);
      if (cropped === canvas) return src;
      return cropped.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return src;
  }
}

export function cropCanvasInk(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx) return source;
  const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (!isInk(r, g, b, a)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return source;
  const pad = Math.max(2, Math.round(Math.max(maxX - minX, maxY - minY) * 0.06));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w >= width - 1 && h >= height - 1) return source;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return source;
  octx.drawImage(source, minX, minY, w, h, 0, 0, w, h);
  return out;
}

function isInk(r: number, g: number, b: number, a: number) {
  if (a < 16) return false;
  return r + g + b < 720;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild nicht ladbar"));
    img.src = src;
  });
}
