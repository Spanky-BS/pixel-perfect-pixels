import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Customer = Tables<"customers">;
export type Job = Tables<"jobs">;
export type JobPhoto = Tables<"job_photos">;
export type VoiceNote = Tables<"voice_notes">;
export type Category = Tables<"material_categories">;
export type Material = Tables<"material_requirements">;
export type Labour = Tables<"labour_items">;
export type Settings = Tables<"settings">;

export const JOB_STATUSES = ["Neu", "Aufnahme", "Materialauswahl", "Offerte", "Auftrag", "Abgeschlossen"] as const;
export const MATERIAL_STATUSES = ["Offen", "Produkt suchen", "Produkt ausgewählt", "Bestätigt"] as const;
export const UNITS = ["Stk", "m", "m²", "Set", "Pkg", "l", "kg"];
export const PHOTO_CATEGORIES = ["Bestand", "Schaden", "Anschluss", "Masse", "Typenschild", "Sonstiges"];

export function customerName(c?: Pick<Customer, "company_name" | "first_name" | "last_name"> | null) {
  if (!c) return "Ohne Kunde";
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return c.company_name || person || "Unbenannt";
}

export function address(o: { street?: string | null; zip?: string | null; city?: string | null }) {
  const line2 = [o.zip, o.city].filter(Boolean).join(" ");
  return [o.street, line2].filter(Boolean).join(", ");
}

const chf = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });
export const formatCHF = (n: number) => chf.format(Number.isFinite(n) ? n : 0);

export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso);
  return d.toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Nicht angemeldet");
  return data.user.id;
}

export const BUCKET = "job-media";

export async function uploadMedia(jobId: string, file: Blob, ext: string) {
  const uid = await requireUserId();
  const path = `${uid}/${jobId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export async function signedUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  data?.forEach((d) => {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  });
  return out;
}

export const statusTone: Record<string, string> = {
  Neu: "bg-secondary text-secondary-foreground",
  Aufnahme: "bg-primary text-primary-foreground",
  Materialauswahl: "bg-warning/20 text-foreground",
  Offerte: "bg-accent text-accent-foreground",
  Auftrag: "bg-success/15 text-success",
  Abgeschlossen: "bg-muted text-muted-foreground",
  Begehung: "bg-primary text-primary-foreground",
  Analyse: "bg-primary/80 text-primary-foreground",
  Grobkosten: "bg-warning/20 text-foreground",
  Produktauswahl: "bg-warning/20 text-foreground",
  Kalkulation: "bg-accent text-accent-foreground",
  Ausführung: "bg-success/15 text-success",
  Rechnung: "bg-success/15 text-success",
  Geplant: "bg-accent text-accent-foreground",
  "In Arbeit": "bg-primary text-primary-foreground",
  Erledigt: "bg-success/15 text-success",
  Verrechnet: "bg-muted text-muted-foreground",
  offen: "bg-warning/20 text-foreground",
  "geklärt": "bg-success/15 text-success",
  "nicht relevant": "bg-muted text-muted-foreground",
  Offen: "bg-muted text-muted-foreground",
  "Produkt suchen": "bg-warning/20 text-foreground",
  "Produkt ausgewählt": "bg-accent text-accent-foreground",
  Bestätigt: "bg-success/15 text-success",
};

// ---- Job types & workflow steps ----
export type JobType = "project" | "service";
export const JOB_TYPE_LABEL: Record<JobType, string> = { project: "Projekt", service: "Regie / Service" };

export const PROJECT_STEPS = ["Begehung", "Analyse", "Grobkosten", "Produktauswahl", "Kalkulation", "Offerte", "Auftrag", "Ausführung", "Rechnung", "Abgeschlossen"] as const;
export const SERVICE_STEPS = ["Neu", "Geplant", "In Arbeit", "Erledigt", "Verrechnet"] as const;

const LEGACY: Record<string, string> = { Neu: "Begehung", Aufnahme: "Begehung", Materialauswahl: "Produktauswahl" };
export function stepsFor(type: string): readonly string[] {
  return type === "service" ? SERVICE_STEPS : PROJECT_STEPS;
}
export function normalizeStatus(type: string, status: string) {
  if (type === "service") return status;
  return LEGACY[status] ?? status;
}
export function isClosed(type: string, status: string) {
  const s = normalizeStatus(type, status);
  return type === "service" ? s === "Erledigt" || s === "Verrechnet" : s === "Abgeschlossen";
}

export const OPEN_STATUSES = ["offen", "geklärt", "nicht relevant"] as const;
export const CONFIDENCE = ["niedrig", "mittel", "hoch"] as const;
export const ESTIMATE_SECTIONS = ["Sanitärapparate", "Armaturen", "Installationsmaterial", "Arbeitsaufwand", "Demontage", "Entsorgung", "Anfahrt", "Kleinmaterial", "Reserve / Unvorhergesehenes", "Sonstiges"];
export const EXTRA_COST_KINDS = ["Anfahrt", "Fahrzeugpauschale", "Entsorgung", "Kleinmaterial", "Spesen", "Sonstiges"];
export const ESTIMATE_DISCLAIMER = "Unverbindliche Grobkostenschätzung auf Basis der aktuellen Bestandesaufnahme und Kundenwünsche. Die definitive Offerte erfolgt nach Produktauswahl und Detailprüfung.";

export const roundTo = (n: number, step = 100) => Math.round(n / step) * step;
