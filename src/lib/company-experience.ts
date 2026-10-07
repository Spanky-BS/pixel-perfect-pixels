import { WORK_GROUP_CATALOG } from "@/lib/app";
import { sectionTitleKey } from "@/lib/labour-grouping";

/** Minimum IST samples before history replaces a generic estimate. */
export const MIN_SAMPLES = 3;
const OUTLIER_FACTOR = 2;
const SCOPE_FACTOR = 1.8;

export type SizeBucket = "regie" | "teilbad" | "bad" | "mehrere";

export type FixtureCounts = {
  wc: number;
  waschtisch: number;
  dusche: number;
  badewanne: number;
  boiler: number;
};

export type SectionObservation = {
  jobId: string;
  bucket: SizeBucket;
  workKey: string;
  quotedHours: number | null;
  actualHours: number | null;
  hasExecutionExtra: boolean;
};

export type LabourExperience = {
  workKey: string;
  medianHours: number | null;
  lowHours: number | null;
  highHours: number | null;
  count: number;
  outliers: number;
  usable: boolean;
  explanation: string | null;
};

export type Correction = {
  workKey: string;
  suggested: number;
  accepted: number;
  decision: "accept" | "edit" | "discard";
  fromHistory: boolean;
};

export type ProductUse = { jobId: string; bucket: SizeBucket; productId: string };

const FIXTURES: { key: keyof FixtureCounts; test: RegExp }[] = [
  { key: "wc", test: /^wc\b|klosett|toilette/i },
  { key: "waschtisch", test: /waschtisch|lavabo/i },
  { key: "dusche", test: /dusche/i },
  { key: "badewanne", test: /badewanne|\bwanne\b/i },
  { key: "boiler", test: /boiler|wassererw/i },
];

const KEY_LABELS: Record<string, string> = {};
for (const title of WORK_GROUP_CATALOG) KEY_LABELS[sectionTitleKey(title)] = title;
KEY_LABELS["demontage"] = "Demontage";
KEY_LABELS["entsorgung"] = "Entsorgung";

export function emptyFixtures(): FixtureCounts {
  return { wc: 0, waschtisch: 0, dusche: 0, badewanne: 0, boiler: 0 };
}

export function addFixture(counts: FixtureCounts, categoryName: string | null | undefined, qty: number) {
  const name = categoryName?.trim();
  if (!name) return;
  const n = Number(qty) > 0 ? Number(qty) : 0;
  if (!n) return;
  for (const rule of FIXTURES) {
    if (rule.test.test(name)) {
      counts[rule.key] += n;
      return;
    }
  }
}

export function sizeBucket(jobType: string, fixtures: FixtureCounts): SizeBucket {
  if (jobType === "service") return "regie";
  const units = fixtures.wc + fixtures.waschtisch + fixtures.dusche + fixtures.badewanne + fixtures.boiler;
  if (units <= 2) return "teilbad";
  if (units <= 6) return "bad";
  return "mehrere";
}

export function bucketForMaterials(jobType: string, materials: Array<{ category: string | null; quantity: number }>): SizeBucket {
  const counts = emptyFixtures();
  for (const m of materials) addFixture(counts, m.category, m.quantity);
  return sizeBucket(jobType, counts);
}

export function workKeyFromTitle(title: string): string | null {
  const norm = sectionTitleKey(title);
  if (!norm) return null;
  const keys = Object.keys(KEY_LABELS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm === key || norm.startsWith(`${key} `) || norm.includes(key)) return key;
  }
  if (/entsorg/.test(norm)) return "entsorgung";
  if (/demont|rückbau|rueckbau|abbruch/.test(norm)) return "demontage";
  return null;
}

export function sectionLabel(workKey: string) {
  return KEY_LABELS[workKey] ?? workKey;
}

export function formatHours(n: number) {
  return n.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  if (hi == null) return null;
  if (sorted.length % 2) return hi;
  const lo = sorted[mid - 1];
  if (lo == null) return hi;
  return (lo + hi) / 2;
}

export function centralRange(values: number[]): { low: number; high: number } | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    const a = sorted[lo];
    const b = sorted[hi];
    if (a == null) return 0;
    if (lo === hi || b == null) return a;
    return a * (hi - i) + b * (i - lo);
  };
  return { low: at(0.25), high: at(0.75) };
}

/** Drop a point that is more than twice the median of the other points. */
export function withoutOutliers(values: number[]): { kept: number[]; outliers: number } {
  if (values.length < 3) return { kept: [...values], outliers: 0 };
  const kept: number[] = [];
  let outliers = 0;
  values.forEach((value, index) => {
    const others = values.filter((_, j) => j !== index);
    const mid = median(others);
    if (mid != null && mid > 0 && value > OUTLIER_FACTOR * mid) outliers += 1;
    else kept.push(value);
  });
  return { kept, outliers };
}

export function usableActualHours(row: SectionObservation): number | null {
  const actual = row.actualHours;
  if (actual == null || actual <= 0) return null;
  const quoted = row.quotedHours;
  if (quoted != null && quoted > 0 && actual > SCOPE_FACTOR * quoted && !row.hasExecutionExtra) return null;
  return actual;
}

export function labourExperience(observations: SectionObservation[], workKey: string, bucket: SizeBucket): LabourExperience {
  const actuals = observations
    .filter((row) => row.workKey === workKey && row.bucket === bucket)
    .map(usableActualHours)
    .filter((n): n is number => n != null);
  const { kept, outliers } = withoutOutliers(actuals);
  const usable = kept.length >= MIN_SAMPLES;
  const mid = usable ? median(kept) : null;
  const range = mid != null ? centralRange(kept) : null;
  let explanation: string | null = null;
  if (mid != null && range) {
    const typical = range.low === range.high
      ? `typisch ${formatHours(range.low)} h`
      : `typisch ${formatHours(range.low)}–${formatHours(range.high)} h`;
    const special = outliers === 0 ? "" : outliers === 1 ? " · 1 Sonderfall nicht verwendet" : ` · ${outliers} Sonderfälle nicht verwendet`;
    explanation = `${formatHours(mid)} h · ${kept.length} ähnliche abgeschlossene Aufträge · ${typical}${special}`;
  }
  return {
    workKey,
    medianHours: mid,
    lowHours: range?.low ?? null,
    highHours: range?.high ?? null,
    count: kept.length,
    outliers,
    usable,
    explanation,
  };
}

export function correctionFactor(corrections: Correction[], workKey: string): { factor: number; count: number } | null {
  const edits = corrections.filter((c) => c.workKey === workKey && c.decision === "edit" && !c.fromHistory && c.suggested > 0);
  if (edits.length < 2) return null;
  const ratios = edits.map((c) => c.accepted / c.suggested);
  const { kept } = withoutOutliers(ratios);
  const mid = median(kept.length ? kept : ratios);
  if (mid == null) return null;
  return { factor: mid, count: edits.length };
}

export function discardHint(corrections: Correction[], workKey: string): string | null {
  const rows = corrections.filter((c) => c.workKey === workKey);
  const discarded = rows.filter((c) => c.decision === "discard").length;
  const kept = rows.length - discarded;
  if (discarded >= 2 && discarded > kept) return "Du verwirfst diesen Vorschlag oft.";
  return null;
}

export function sectionHourHint(workKey: string | null, bucket: SizeBucket, observations: SectionObservation[]): string | null {
  if (!workKey) return null;
  const stat = labourExperience(observations, workKey, bucket);
  if (!stat.usable || stat.medianHours == null) return null;
  return `${sectionLabel(workKey)} auf ähnlichen Aufträgen gesamt etwa ${formatHours(stat.medianHours)} h`;
}

export function proposeLabourHours(input: {
  description: string;
  aiHours: number;
  bucket: SizeBucket;
  observations: SectionObservation[];
  corrections: Correction[];
}): { hours: number; explanation: string | null; fromHistory: boolean; discardHint: string | null } {
  const key = workKeyFromTitle(input.description);
  const hint = key ? discardHint(input.corrections, key) : null;
  return {
    hours: input.aiHours,
    explanation: sectionHourHint(key, input.bucket, input.observations),
    fromHistory: false,
    discardHint: hint,
  };
}

export function productUseCount(uses: ProductUse[], productId: string, bucket: SizeBucket) {
  return new Set(uses.filter((u) => u.productId === productId && u.bucket === bucket).map((u) => u.jobId)).size;
}

export function productUseLabel(count: number) {
  if (count <= 0) return null;
  if (count === 1) return "in 1 ähnlichem Auftrag";
  return `in ${count} ähnlichen Aufträgen`;
}

type GuideLabour = { description: string; hours: number };

export function estimateWithExperience(input: {
  guide: Record<string, number>;
  labour: GuideLabour[];
  currentRate: number;
  bucket: SizeBucket;
  observations: SectionObservation[];
}): { amounts: Record<string, number>; explanations: string[] } {
  const amounts: Record<string, number> = { ...input.guide };
  const explanations: string[] = [];
  const grouped = new Map<string, number>();
  let arbeits = 0;
  for (const line of input.labour) {
    const hours = Number(line.hours) || 0;
    arbeits += hours * input.currentRate;
    const key = workKeyFromTitle(line.description);
    if (key) grouped.set(key, (grouped.get(key) ?? 0) + hours);
  }
  amounts["Arbeitsaufwand"] = Math.round(arbeits);

  for (const [key, hours] of grouped) {
    const stat = labourExperience(input.observations, key, input.bucket);
    if (!stat.usable || stat.medianHours == null || !stat.explanation) continue;
    const current = Math.round(hours * input.currentRate);
    const historical = Math.round(stat.medianHours * input.currentRate);
    if (key === "demontage" || key === "entsorgung") {
      const section = key === "demontage" ? "Demontage" : "Entsorgung";
      amounts[section] = historical;
      amounts["Arbeitsaufwand"] = Math.max(0, Math.round((amounts["Arbeitsaufwand"] ?? 0) - current));
    } else {
      amounts["Arbeitsaufwand"] = Math.max(0, Math.round((amounts["Arbeitsaufwand"] ?? 0) - current + historical));
    }
    explanations.push(`${sectionLabel(key)}: ${stat.explanation}. Ansatz aus den Einstellungen.`);
  }
  return { amounts, explanations };
}

export type ExperienceJob = {
  id: string;
  jobType: string;
  lifecycleStatus: string;
  status: string;
};

export type ExperienceLabour = {
  id: string;
  jobId: string;
  description: string;
  hours: number;
  source: string;
  itemType: string;
  parentId: string | null;
};

export type ExperienceMaterial = {
  jobId: string;
  category: string | null;
  quantity: number;
  actualQuantity: number | null;
  productId: string | null;
};

export function isCompletedForExperience(job: Pick<ExperienceJob, "jobType" | "lifecycleStatus" | "status">) {
  if (job.lifecycleStatus === "cancelled" || job.status === "Abgesagt") return false;
  if (job.lifecycleStatus === "completed") return true;
  if (job.jobType === "service") return job.status === "Verrechnet";
  return job.status === "Abgeschlossen";
}

export function buildExperience(input: {
  jobs: ExperienceJob[];
  labour: ExperienceLabour[];
  times: Array<{ labourItemId: string; hours: number }>;
  materials: ExperienceMaterial[];
  serviceLabour: Array<{ jobId: string; description: string; hours: number }>;
  excludeJobId?: string;
}): { observations: SectionObservation[]; productUses: ProductUse[] } {
  const jobs = input.jobs.filter((job) => job.id !== input.excludeJobId && isCompletedForExperience(job));
  const open = new Set(jobs.map((job) => job.id));
  const fixtures = new Map<string, FixtureCounts>();
  for (const material of input.materials) {
    if (!open.has(material.jobId)) continue;
    const counts = fixtures.get(material.jobId) ?? emptyFixtures();
    addFixture(counts, material.category, material.quantity);
    fixtures.set(material.jobId, counts);
  }

  const productUses: ProductUse[] = [];
  for (const material of input.materials) {
    if (!open.has(material.jobId) || !material.productId) continue;
    const consumed = material.actualQuantity != null ? material.actualQuantity > 0 : material.quantity > 0;
    if (!consumed) continue;
    const job = jobs.find((row) => row.id === material.jobId);
    if (!job) continue;
    productUses.push({
      jobId: material.jobId,
      productId: material.productId,
      bucket: sizeBucket(job.jobType, fixtures.get(material.jobId) ?? emptyFixtures()),
    });
  }

  const times = new Map<string, number>();
  for (const entry of input.times) times.set(entry.labourItemId, (times.get(entry.labourItemId) ?? 0) + Number(entry.hours));

  const observations: SectionObservation[] = [];
  for (const job of jobs) {
    const bucket = sizeBucket(job.jobType, fixtures.get(job.id) ?? emptyFixtures());
    if (job.jobType === "service") {
      for (const line of input.serviceLabour) {
        if (line.jobId !== job.id || !(line.hours > 0)) continue;
        const workKey = workKeyFromTitle(line.description);
        if (!workKey) continue;
        observations.push({ jobId: job.id, bucket: "regie", workKey, quotedHours: null, actualHours: line.hours, hasExecutionExtra: false });
      }
      continue;
    }
    const items = input.labour.filter((row) => row.jobId === job.id);
    const sections = items.filter((row) => row.itemType !== "task" && row.source !== "execution");
    for (const section of sections) {
      const workKey = workKeyFromTitle(section.description);
      if (!workKey) continue;
      const childIds = items.filter((row) => row.parentId === section.id && row.source !== "execution").map((row) => row.id);
      const actual = [section.id, ...childIds].reduce((sum, id) => sum + (times.get(id) ?? 0), 0);
      const hasExecutionExtra = items.some((row) => row.source === "execution" && (row.parentId === section.id || workKeyFromTitle(row.description) === workKey));
      observations.push({
        jobId: job.id,
        bucket,
        workKey,
        quotedHours: Number(section.hours),
        actualHours: actual > 0 ? actual : null,
        hasExecutionExtra,
      });
    }
  }
  return { observations, productUses };
}

export type SuggestionDecision = "accept" | "edit" | "discard";

export function correctionsFromSuggestions(rows: Array<{ kind: string; state: string; payload: unknown }>): Correction[] {
  const out: Correction[] = [];
  for (const row of rows) {
    if (row.kind !== "labour" || row.state === "pending") continue;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const workKey = workKeyFromTitle(String(payload["beschreibung"] ?? ""));
    if (!workKey) continue;
    const raw = payload["entscheid"];
    const decision: SuggestionDecision = raw === "edit" || raw === "discard" || raw === "accept"
      ? raw
      : row.state === "discarded" ? "discard" : "accept";
    const suggested = Number(payload["stunden"]);
    const acceptedRaw = payload["uebernommen"];
    const accepted = acceptedRaw == null ? suggested : Number(acceptedRaw);
    if (!Number.isFinite(suggested)) continue;
    out.push({
      workKey,
      suggested,
      accepted: Number.isFinite(accepted) ? accepted : suggested,
      decision,
      fromHistory: payload["firma"] === true,
    });
  }
  return out;
}
