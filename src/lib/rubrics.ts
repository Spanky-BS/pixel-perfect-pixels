/**
 * Swiss trade rubrics (BKP 25 Sanitär) used to structure Offerte, Ausführung and Rechnung.
 * Every labour/material row carries a rubric code; rows without one are classified by text.
 */
export type Rubric = { code: string; title: string; group: string; groupTitle: string; template: string };

export const RUBRICS: Rubric[] = [
  { code: "250", title: "Sanitärapparate & Garnituren", group: "250", groupTitle: "Sanitärapparate",
    template: "Liefern und Montieren der Sanitärapparate gemäss Auswahl, inkl. Befestigungsmaterial, Anschluss an die bestehenden Leitungen und Funktionskontrolle." },
  { code: "252", title: "Spezielles", group: "252", groupTitle: "Spezielles",
    template: "Liefern und Montieren gemäss Beschrieb, inkl. Anschluss und Inbetriebnahme." },
  { code: "253", title: "Wassererwärmer", group: "253", groupTitle: "Wassererwärmer",
    template: "Liefern und Montieren des Wassererwärmers inkl. Sicherheitsgruppe, Entleerung und Anschluss an Kalt- und Warmwasser. Elektrischer Anschluss bauseits." },
  { code: "254.0", title: "Kaltwasser", group: "254", groupTitle: "Sanitärleitungen",
    template: "Erstellen der Kaltwasserleitungen gemäss den branchenüblichen Normen und Vorschriften.\nAusgeführt wie folgt:\nAbnahme ab bestehender Leitung, neue Anschlüsse mit separatem Abstellventil. Betriebsbereit montiert, inkl. Durchspülung und Dichtigkeitsprüfung." },
  { code: "254.1", title: "Warmwasser", group: "254", groupTitle: "Sanitärleitungen",
    template: "Erstellen der Warmwasserleitungen gemäss den branchenüblichen Normen und Vorschriften.\nAusgeführt wie folgt:\nAbnahme ab Wassererwärmer bis zu den neuen Anschlüssen. Betriebsbereit montiert, inkl. Durchspülung und Dichtigkeitsprüfung." },
  { code: "254.2", title: "Schmutzwasser", group: "254", groupTitle: "Sanitärleitungen",
    template: "Erstellen der Schmutzabwasserleitungen in PE-Kunststoffrohren gemäss den branchenüblichen Normen und Vorschriften.\nAusgeführt wie folgt:\nAnschluss an bestehende Abwasserleitung, inkl. Belüftungsventilen wo erforderlich. Betriebsbereit montiert, inkl. Dichtigkeitsprüfung." },
  { code: "255", title: "Dämmungen", group: "255", groupTitle: "Dämmungen",
    template: "Dämmen der Leitungen mittels PIR-Schalen mit PVC-Ummantelung gegen Schwitzwasser bzw. Wärmeverluste." },
  { code: "259.0", title: "Demontage", group: "259", groupTitle: "Übriges",
    template: "Demontage der nicht mehr erforderlichen Apparate und Leitungen, inkl. Wasserabstellungen, Leitungen verzapfen. Abfuhr und Entsorgung der Altmaterialien." },
  { code: "259.1", title: "Spitz- und Bohrarbeiten", group: "259", groupTitle: "Übriges",
    template: "Erstellen der erforderlichen Spitz- und Bohrarbeiten für die Leitungsführung, inkl. Entsorgung des Bauschuttes." },
  { code: "259.2", title: "Unvorhergesehenes (Reserve / Zusätzliches)", group: "259", groupTitle: "Übriges",
    template: "Reserve für die Ausführung von unvorhergesehenen oder zusätzlichen Arbeiten, welche zum Zeitpunkt der Offerte noch nicht bekannt waren." },
];

export const DEFAULT_RUBRIC = "259.2";
export const rubricByCode = (code: string | null | undefined) => RUBRICS.find((r) => r.code === code) ?? null;

const RULES: Array<[RegExp, string]> = [
  [/demont|rückbau|rueckbau|abbruch|entsorg|verzapf|entleer/i, "259.0"],
  [/spitz|bohr|kernloch|schlitz|durchbruch/i, "259.1"],
  [/unvorher|reserve|zusätzlich|regie/i, "259.2"],
  [/boiler|wassererwärm|wassererwaerm|warmwasserspeicher|wärmepumpenboiler/i, "253"],
  [/dämm|daemm|isolier|pir-?schal/i, "255"],
  [/bodenrinne|hebeanlage|pump|abluft|ventilator|enthärt|enthaert|filter/i, "252"],
  [/schmutz|abwasser|ablauf|fallleitung|fallstrang|siphon|kanal|geberit\s*pe|\bpe\b/i, "254.2"],
  [/warm\s*-?\s*und\s*kalt|kalt\s*-?\s*und\s*warm/i, "254.0"],
  [/warmwasser|zirkulation/i, "254.1"],
  [/kaltwasser|zuleitung|wasserzähler|wassermesser|druckreduz|verteiler|leitung|rohr/i, "254.0"],
  [/wc|klosett|waschtisch|lavabo|dusche|wanne|armatur|mischer|apparat|pissoir|urinal|spiegel|endmontage|montage|garnitur|ausguss|spültisch/i, "250"],
];

/** Classify a free-text position into a rubric code. */
export function guessRubric(text: string | null | undefined): string {
  const t = (text ?? "").toLowerCase();
  for (const [re, code] of RULES) if (re.test(t)) return code;
  return DEFAULT_RUBRIC;
}

export function rubricOf(row: { rubric?: string | null; description?: string | null }): string {
  return rubricByCode(row.rubric)?.code ?? guessRubric(row.description);
}

const order = (code: string) => RUBRICS.findIndex((r) => r.code === code);

export type RubricGroup<T> = { rubric: Rubric; items: T[]; total: number };
export type MainGroup<T> = { group: string; title: string; rubrics: RubricGroup<T>[]; total: number };

/** Group rows into ordered rubrics (only non-empty ones) and their main groups (254 → 254.0/254.1/254.2). */
export function groupByRubric<T extends { rubric?: string | null; description?: string | null }>(rows: T[], amountOf: (row: T) => number): MainGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const code = rubricOf(r);
    map.set(code, [...(map.get(code) ?? []), r]);
  }
  const rubrics = [...map.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([code, items]) => ({ rubric: rubricByCode(code)!, items, total: round2(items.reduce((s, i) => s + amountOf(i), 0)) }));
  const mains: MainGroup<T>[] = [];
  for (const rg of rubrics) {
    let m = mains.find((x) => x.group === rg.rubric.group);
    if (!m) { m = { group: rg.rubric.group, title: rg.rubric.groupTitle, rubrics: [], total: 0 }; mains.push(m); }
    m.rubrics.push(rg);
    m.total = round2(m.total + rg.total);
  }
  return mains;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const DEFAULT_EXCLUSIONS = [
  "Maurer-, Plattenleger- und Malerarbeiten sind nicht enthalten.",
  "Elektroarbeiten und elektrische Zuleitungen sind nicht enthalten (bauseits).",
  "Verdeckte Schäden oder unbekannte Leitungsverhältnisse sind nicht berücksichtigt.",
  "Arbeiten ausserhalb des beschriebenen Leistungsumfangs werden nach Aufwand verrechnet.",
  "Bewilligungen und Planungsleistungen sind nur enthalten, wenn ausdrücklich erwähnt.",
];

export function asStringList(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

/** Job's own list wins (may be empty after deleting all); otherwise the settings defaults. */
export function effectiveExclusions(jobList: unknown, settingsList: unknown): string[] {
  return asStringList(jobList) ?? asStringList(settingsList) ?? DEFAULT_EXCLUSIONS;
}
