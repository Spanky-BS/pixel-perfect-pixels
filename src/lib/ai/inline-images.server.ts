import type { SupabaseClient } from "@supabase/supabase-js";

/** Max edge length sent to the AI — small images keep token/credit use low. */
const MAX_PX = 768;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Loads images from storage and returns them as inline data parts, so the AI
 * never has to fetch external URLs (those time out). Tries a downscaled
 * version first; falls back to the original file if resizing is unavailable.
 */
export async function inlineImageParts(sb: SupabaseClient, paths: string[]) {
  const parts: Array<Record<string, unknown>> = [];
  for (const path of paths) {
    let res = await sb.storage.from("job-media").download(path, { transform: { width: MAX_PX, height: MAX_PX, resize: "contain", quality: 60 } });
    if (res.error || !res.data) res = await sb.storage.from("job-media").download(path);
    if (res.error || !res.data) continue;
    const mime = res.data.type && res.data.type.startsWith("image/") ? res.data.type : "image/jpeg";
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${toBase64(await res.data.arrayBuffer())}`, detail: "low" } });
  }
  return parts;
}
