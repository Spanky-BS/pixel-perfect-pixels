/**
 * Swiss reference prices (CHF, VK excl. MWST) for rough cost estimates.
 * Typical ranges from Swiss wholesale (Sanitas Troesch / Richner for fixtures,
 * Pestalozzi for installation material). Used only for the non-binding Grobkostenschätzung.
 */
export type PriceGuideEntry = { label: string; keywords: string[]; section: string; low: number; high: number };

export const PRICE_GUIDE: PriceGuideEntry[] = [
  { label: "Wand-WC komplett", keywords: ["wc", "klosett", "toilette"], section: "Sanitärapparate", low: 650, high: 950 },
  { label: "Vorwandelement (z.B. Geberit Duofix)", keywords: ["duofix", "vorwand", "unterputz", "spülkasten", "spuelkasten"], section: "Installationsmaterial", low: 450, high: 650 },
  { label: "Betätigungsplatte", keywords: ["betätigung", "betaetigung", "drückerplatte", "sigma"], section: "Sanitärapparate", low: 120, high: 280 },
  { label: "Waschtisch mit Unterbaumöbel", keywords: ["unterbaumöbel", "unterbaumoebel", "unterbau", "möbel", "moebel", "waschtischmöbel"], section: "Sanitärapparate", low: 1200, high: 1900 },
  { label: "Waschtisch / Lavabo", keywords: ["waschtisch", "lavabo", "aufsatzbecken", "becken"], section: "Sanitärapparate", low: 350, high: 750 },
  { label: "Spiegelschrank", keywords: ["spiegelschrank", "spiegel"], section: "Sanitärapparate", low: 750, high: 1200 },
  { label: "Dusche bodeneben / Duschwanne", keywords: ["dusche", "duschwanne", "bodeneben", "duschrinne"], section: "Sanitärapparate", low: 1500, high: 2400 },
  { label: "Duschwand Glas", keywords: ["duschwand", "glaswand", "duschtrennwand"], section: "Sanitärapparate", low: 900, high: 1800 },
  { label: "Badewanne", keywords: ["badewanne", "wanne"], section: "Sanitärapparate", low: 900, high: 1800 },
  { label: "Boiler / Warmwasser", keywords: ["boiler", "wassererwärmer", "warmwasserspeicher"], section: "Sanitärapparate", low: 1400, high: 2800 },
  { label: "Duschthermostat / Brause", keywords: ["thermostat", "brause", "duschsystem", "regenbrause"], section: "Armaturen", low: 450, high: 750 },
  { label: "Waschtisch- / Küchenmischer", keywords: ["mischer", "armatur", "einhebel", "batterie"], section: "Armaturen", low: 180, high: 350 },
  { label: "Eckventil", keywords: ["eckventil", "absperr", "ventil"], section: "Installationsmaterial", low: 25, high: 45 },
  { label: "Siphon", keywords: ["siphon", "geruchverschluss"], section: "Installationsmaterial", low: 35, high: 90 },
  { label: "Rohre / Leitungsanpassung", keywords: ["rohr", "leitung", "mepla", "mapress", "sanipex", "pex", "ablauf", "fitting"], section: "Installationsmaterial", low: 80, high: 180 },
  { label: "Dichtungen / Befestigung", keywords: ["dichtung", "schraube", "befestigung", "dübel", "hanf", "silikon"], section: "Kleinmaterial", low: 10, high: 30 },
];

export const FALLBACK = { section: "Installationsmaterial", low: 50, high: 150 };

/** Flat Richtwerte per job when the respective work is mentioned. */
export const FLAT = {
  demontage: { section: "Demontage", low: 600, high: 1100 },
};

export function matchGuide(text: string): PriceGuideEntry | null {
  const t = text.toLowerCase();
  // Longest keyword wins so "unterbaumöbel" beats "waschtisch".
  let best: { e: PriceGuideEntry; len: number } | null = null;
  for (const e of PRICE_GUIDE) for (const k of e.keywords) if (t.includes(k) && (!best || k.length > best.len)) best = { e, len: k.length };
  return best?.e ?? null;
}

const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2;

export type GuideMaterial = { description: string; quantity: number; category?: string | null | undefined };
export type GuideLabour = { description: string; hours: number; hourly_rate: number };

export type GuideLine = { section: string; label: string; detail: string; amount: number };

/** Every material/labour line with the section and amount it contributes to the estimate. */
const DEMO_RE = /demont|rückbau|rueckbau|abbruch|entleer|verzapf/i;
const DISPOSAL_RE = /entsorg|abtransport|mulde/i;
/** Work that contains both removal and (re)installation, e.g. "Demontage und Remontage". */
const REMOUNT_RE = /remont|wiedermont|wieder\s*mont|wiederanschl|wieder\s*anschl|neu\s*mont|und\s+montage/i;
/** Share of a combined line that counts as Demontage; the rest is Arbeitsaufwand. */
export const DEMO_SHARE = 0.4;
/** Flat disposal when demolition is mentioned and no own disposal work exists. */
export const DISPOSAL = { flat: 350 };
/** Vehicle fee per started 8-hour working day. */
export const VEHICLE = { perDay: 75, hoursPerDay: 8 };
/** Kleinmaterial and Reserve as share of the running total. */
export const SMALL_MATERIAL_RATE = 0.2;
export const RESERVE_RATE = 0.1;
export const RESERVE_SECTION = "Reserve / Unvorhergesehenes";

/** "Demontage 2 x WC" -> 2; falls back to 1. */
export function partsIn(text: string): number {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:x|×|stk|stück)\b/i);
  return m ? Math.max(1, Math.round(Number(m[1]!.replace(",", ".")))) : 1;
}

const q4 = (h: number) => Math.round(h * 4) / 4;

/** Every material/labour line with the section and amount it contributes to the estimate. */
export function breakdownFromGuide(materials: GuideMaterial[], labour: GuideLabour[]): GuideLine[] {
  const lines: GuideLine[] = [];
  let demolitionMentioned = false;
  let demolitionHours = 0;
  let totalHours = 0;
  let disposalLabour = false;
  for (const m of materials) {
    const text = `${m.category ?? ""} ${m.description}`;
    if (/demont|rückbau|rueckbau|^alt|\balte[sr]?\b/i.test(m.description)) {
      demolitionMentioned = true;
      continue;
    }
    const g = matchGuide(text);
    const qty = Number(m.quantity) > 0 ? Number(m.quantity) : 1;
    const unit = mid(g ?? FALLBACK);
    lines.push({
      section: g?.section ?? FALLBACK.section,
      label: m.description,
      detail: `${qty} × ${Math.round(unit)} CHF${g ? ` (Richtwert ${g.label})` : " (Pauschale)"}`,
      amount: Math.round(unit * qty),
    });
  }
  const seen = new Set<string>();
  for (const l of labour) {
    // Same work listed twice (e.g. repeated AI runs) is only counted once.
    const key = l.description.toLowerCase().replace(/[^a-z0-9äöü]+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const hours = Number(l.hours) || 0;
    const rate = Number(l.hourly_rate);
    totalHours += hours;
    // Disposal work hours (loading/transport) count as normal labour; fees are the flat Entsorgung.
    const disposal = DISPOSAL_RE.test(l.description);
    const demo = !disposal && DEMO_RE.test(l.description);
    if (disposal) disposalLabour = true;
    if (demo) demolitionMentioned = true;
    if (demo && REMOUNT_RE.test(l.description) && hours > 0) {
      const dh = q4(hours * DEMO_SHARE);
      const mh = hours - dh;
      demolitionHours += dh;
      const obj = splitObject(l.description);
      lines.push({ section: "Demontage", label: `Demontage ${obj}`, detail: `${dh} h × ${rate} CHF (Anteil Demontage von ${hours} h)`, amount: Math.round(dh * rate) });
      lines.push({ section: "Arbeitsaufwand", label: `Montage ${obj}`, detail: `${mh} h × ${rate} CHF (Anteil Montage von ${hours} h)`, amount: Math.round(mh * rate) });
      continue;
    }
    const section = demo ? "Demontage" : "Arbeitsaufwand";
    lines.push({ section, label: l.description, detail: `${hours} h × ${rate} CHF`, amount: Math.round(hours * rate) });
    if (demo && hours > 0) demolitionHours += hours;
  }
  if (demolitionMentioned && demolitionHours === 0) {
    lines.push({ section: FLAT.demontage.section, label: "Demontage bestehender Apparate", detail: "Pauschale (keine Demontage-Stunden erfasst)", amount: mid(FLAT.demontage) });
  }
  if (demolitionMentioned || disposalLabour) {
    lines.push({ section: "Entsorgung", label: "Entsorgung demontierter Teile", detail: "Pauschale (Gebühren)", amount: DISPOSAL.flat });
  }
  if (totalHours > 0) {
    const days = Math.ceil(totalHours / VEHICLE.hoursPerDay);
    lines.push({ section: "Fahrzeugpauschale", label: "Fahrzeugpauschale", detail: `${days} Tag(e) × ${VEHICLE.perDay} CHF (je ${VEHICLE.hoursPerDay} h, total ${totalHours} h)`, amount: days * VEHICLE.perDay });
  }
  const sum = () => lines.reduce((s, x) => s + x.amount, 0);
  const base = sum();
  if (base > 0) {
    lines.push({ section: "Kleinmaterial", label: "Kleinmaterial pauschal", detail: `${SMALL_MATERIAL_RATE * 100}% von CHF ${base}`, amount: Math.round(base * SMALL_MATERIAL_RATE) });
    const withSmall = sum();
    lines.push({ section: RESERVE_SECTION, label: "Reserve", detail: `${RESERVE_RATE * 100}% von CHF ${withSmall}`, amount: Math.round(withSmall * RESERVE_RATE) });
  }
  return lines;
}

/** Returns amount per estimate section, pre-filled from reference prices. */
export function estimateFromGuide(materials: GuideMaterial[], labour: GuideLabour[]) {
  const out: Record<string, number> = {};
  for (const l of breakdownFromGuide(materials, labour)) out[l.section] = (out[l.section] ?? 0) + l.amount;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] ?? 0);
  return out;
}
