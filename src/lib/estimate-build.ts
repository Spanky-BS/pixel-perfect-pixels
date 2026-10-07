import { supabase } from "@/integrations/supabase/client";
import { ESTIMATE_SECTIONS } from "@/lib/app";
import { hourlyRateFromSettings, MISSING_RATE, settingNumber } from "@/lib/commercial";
import { bucketForMaterials, estimateWithExperience, type SectionObservation } from "@/lib/company-experience";
import { breakdownFromGuide, type GuideLabour, type GuideLine, type GuideMaterial } from "@/lib/price-guide";
import type { Settings } from "@/lib/app";

type P = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v ?? "").replace(",", ".")) || 0);

/**
 * Grobkosten come straight from the survey: accepted material/labour PLUS
 * pending AI suggestions, so no manual confirmation is needed first.
 */
export async function buildEstimate(jobId: string, settings: Settings | null | undefined, observations: SectionObservation[]) {
  const rate = hourlyRateFromSettings(settings);
  const tolerance = settingNumber(settings?.estimate_tolerance);
  if (rate == null) return { error: MISSING_RATE } as const;
  if (tolerance == null) return { error: "Grobkosten-Toleranz fehlt in den Einstellungen." } as const;

  const [{ data: lab }, { data: mat }, { data: sugg }] = await Promise.all([
    supabase.from("labour_items").select("description, hours, source, item_type, parent_id").eq("job_id", jobId),
    supabase.from("material_requirements").select("description, quantity, material_categories(name)").eq("job_id", jobId),
    supabase.from("ai_suggestions").select("kind, payload").eq("job_id", jobId).eq("state", "pending"),
  ]);
  const materials: GuideMaterial[] = (mat ?? []).map((m) => ({
    description: m.description,
    quantity: Number(m.quantity),
    category: (m.material_categories as { name: string } | null)?.name ?? null,
  }));
  const labour: GuideLabour[] = (lab ?? [])
    .filter((l) => l.source !== "execution" && (l.item_type === "task" ? !l.parent_id : true))
    .map((l) => ({ description: l.description, hours: Number(l.hours), hourly_rate: rate }));
  for (const s of sugg ?? []) {
    const p = (s.payload ?? {}) as P;
    if (s.kind === "material" && str(p["beschreibung"])) {
      materials.push({ description: str(p["beschreibung"]), quantity: num(p["menge"]) || 1, category: str(p["kategorie"]) || null });
    } else if (s.kind === "labour" && str(p["beschreibung"])) {
      labour.push({ description: str(p["beschreibung"]), hours: num(p["stunden"]), hourly_rate: rate });
    }
  }

  const guide = breakdownFromGuide(materials, labour);
  const priced = estimateWithExperience({
    guide: guide.amounts,
    labour,
    currentRate: rate,
    bucket: bucketForMaterials("project", materials.map((m) => ({ category: m.category ?? null, quantity: m.quantity }))),
    observations,
  });
  const details: Record<string, GuideLine[]> = {};
  for (const section of ESTIMATE_SECTIONS) {
    const lines = [...(guide.details[section] ?? [])];
    const diff = Math.round((priced.amounts[section] ?? 0) - lines.reduce((a, l) => a + l.amount, 0));
    if (lines.length && Math.abs(diff) >= 1) lines.push({ label: "Korrektur aus Firmenerfahrung", amount: diff });
    details[section] = lines;
  }
  const notes = priced.explanations.length
    ? priced.explanations.join(" ")
    : "Automatisch aus der Begehung mit Schweizer Richtwerten (Sanitas Troesch / Richner / Pestalozzi) berechnet.";
  return { amounts: priced.amounts, details, notes, tolerance } as const;
}

/** Writes the estimate into the newest version (creates V1 if none). Custom rows stay. */
export async function saveEstimate(jobId: string, built: { amounts: Record<string, number>; details: Record<string, GuideLine[]>; notes: string; tolerance: number }, estimateId?: string) {
  let id = estimateId;
  if (!id) {
    const { data: latest } = await supabase.from("cost_estimates").select("id").eq("job_id", jobId).order("version", { ascending: false }).limit(1).maybeSingle();
    id = latest?.id;
  }
  if (!id) {
    const { data, error } = await supabase.from("cost_estimates").insert({ job_id: jobId, version: 1, tolerance: built.tolerance, notes: built.notes }).select("id").single();
    if (error) throw error;
    id = data.id;
  } else {
    await supabase.from("cost_estimates").update({ notes: built.notes }).eq("id", id);
  }
  const { data: existing } = await supabase.from("cost_estimate_items").select("id, section, description").eq("estimate_id", id);
  await Promise.all(ESTIMATE_SECTIONS.map((section, i) => {
    const row = (existing ?? []).find((it) => it.section === section && it.description === section) ?? (existing ?? []).find((it) => it.section === section);
    const patch = { amount: built.amounts[section] ?? 0, details: (built.details[section] ?? []) as never };
    if (row) return supabase.from("cost_estimate_items").update(patch).eq("id", row.id);
    return supabase.from("cost_estimate_items").insert({ estimate_id: id!, section, description: section, sort_order: i, ...patch });
  }));
  return id;
}
