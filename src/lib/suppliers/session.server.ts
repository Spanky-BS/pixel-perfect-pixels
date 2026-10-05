import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Company shop sessions stay on the server.
 * A future Playwright/Node worker can refresh cookies and write here
 * (or to RICHNER_COOKIE_HEADER) without changing the PWA or adapters.
 */
const KEY = "richner";

function keyFromSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSessionPayload(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSessionPayload(blob: string, secret: string) {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export type RichnerSession = {
  cookieHeader: string;
  baseUrl: string;
};

export async function loadRichnerSession(userId: string): Promise<RichnerSession> {
  const baseUrl = (process.env["RICHNER_BASE_URL"] ?? "https://baubedarf-richner.ch").replace(/\/$/, "");
  const envCookie = process.env["RICHNER_COOKIE_HEADER"]?.trim();
  if (envCookie) return { cookieHeader: envCookie, baseUrl };

  const secret = process.env["SUPPLIER_SESSION_SECRET"];
  if (!secret) {
    throw new Error("Richner ist nicht verbunden. Session nur serverseitig hinterlegen.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("supplier_sessions")
    .select("encrypted_payload, expires_at")
    .eq("user_id", userId)
    .eq("supplier_key", KEY)
    .maybeSingle();
  if (error) throw new Error("Lieferanten-Session konnte nicht geladen werden");
  if (!data) throw new Error("Richner ist nicht verbunden.");
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error("Richner-Session abgelaufen. Bitte serverseitig erneuern.");
  }
  const cookieHeader = decryptSessionPayload(data.encrypted_payload, secret).trim();
  if (!cookieHeader) throw new Error("Richner-Session ungültig.");
  return { cookieHeader, baseUrl };
}

export async function hasRichnerSession(userId: string): Promise<boolean> {
  if (process.env["RICHNER_COOKIE_HEADER"]?.trim()) return true;
  const secret = process.env["SUPPLIER_SESSION_SECRET"];
  if (!secret) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("supplier_sessions")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("supplier_key", KEY)
      .maybeSingle();
    if (!data) return false;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}
