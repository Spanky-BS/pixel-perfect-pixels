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
  entsorgung: { section: "Entsorgung", low: 250, high: 450 },
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

/** Returns amount per estimate section, pre-filled from reference prices. */
export function estimateFromGuide(materials: GuideMaterial[], labour: GuideLabour[]) {
  const out: Record<string, number> = {};
  const add = (s: string, v: number) => { out[s] = (out[s] ?? 0) + v; };
  let demolition = false;
  for (const m of materials) {
    const text = `${m.category ?? ""} ${m.description}`;
    if (/demont|rückbau|rueckbau|^alt|\balte[sr]?\b/i.test(m.description)) { demolition = true; continue; }
    const g = matchGuide(text);
    const qty = Number(m.quantity) > 0 ? Number(m.quantity) : 1;
    add(g?.section ?? FALLBACK.section, mid(g ?? FALLBACK) * qty);
  }
  for (const l of labour) {
    add("Arbeitsaufwand", Number(l.hours) * Number(l.hourly_rate));
    if (/demont|rückbau|rueckbau|abbruch/i.test(l.description)) demolition = true;
  }
  if (demolition) {
    add(FLAT.demontage.section, mid(FLAT.demontage));
    add(FLAT.entsorgung.section, mid(FLAT.entsorgung));
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] ?? 0);
  return out;
}
