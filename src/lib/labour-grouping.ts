import {
  EXECUTION_SOURCE,
  LABOUR_ITEM_SECTION,
  LABOUR_ITEM_TASK,
  WORK_GROUP_CATALOG,
  labourItemType,
  type Labour,
} from "@/lib/app";

export type GroupDraft = {
  title: string;
  notes: string;
  taskIds: string[];
};

const TITLE_EQUIVALENTS: Record<string, string> = {
  "warm- und kaltwasser": "kalt- und warmwasser",
  "kaltwasser und warmwasser": "kalt- und warmwasser",
  "warmwasser und kaltwasser": "kalt- und warmwasser",
  "demontage / wiedermontage": "demontage",
  "unvorhergesehenes / reserve": "unvorhergesehenes",
};

export function sectionTitleKey(title: string) {
  const raw = title.trim().toLowerCase().replace(/\s+/g, " ");
  return TITLE_EQUIVALENTS[raw] ?? raw;
}

export function canonicalSectionTitle(title: string) {
  const key = sectionTitleKey(title);
  if (key === "kalt- und warmwasser") return "Kalt- und Warmwasser";
  return title.trim();
}

export function sameSectionTitle(a: string, b: string) {
  return sectionTitleKey(a) === sectionTitleKey(b);
}

const CATALOG_KEYS = WORK_GROUP_CATALOG.map((title) => sectionTitleKey(title));

const WORK_KEY_LABEL: Record<string, string> = {
  demontage: "Demontage",
  unvorhergesehenes: "Unvorhergesehenes",
  "bodenrinne / spezielles": "Bodenrinne",
  "wassererwärmer / boiler": "Boiler",
};

export function catalogWorkKeys() {
  return CATALOG_KEYS;
}

export function workKeyLabel(key: string) {
  return WORK_KEY_LABEL[key] ?? WORK_GROUP_CATALOG.find((title) => sectionTitleKey(title) === key) ?? key;
}

/** Catalog match only. Unknown text stays unassigned, including when it is not really Unvorhergesehenes. */
export function resolveWorkKey(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const key = sectionTitleKey(text);
  return CATALOG_KEYS.includes(key) ? key : null;
}

export function normalizeAnalyseTask(input: { description?: string | null; category?: string | null; hours?: number | null }) {
  const hours = typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0 ? input.hours : null;
  return {
    description: (input.description ?? "").trim(),
    workKey: resolveWorkKey(input.category),
    hours,
  };
}

export function isLabourTask(l: Pick<Labour, "item_type" | "source">) {
  return labourItemType(l) === LABOUR_ITEM_TASK && l.source !== EXECUTION_SOURCE;
}

export function isLabourSection(l: Pick<Labour, "item_type" | "source">) {
  return labourItemType(l) === LABOUR_ITEM_SECTION && l.source !== EXECUTION_SOURCE;
}

export function childTasks(list: Labour[] | null | undefined, sectionId: string) {
  return (list ?? []).filter((l) => isLabourTask(l) && l.parent_id === sectionId);
}

export function ungroupedTasks(list: Labour[] | null | undefined) {
  return (list ?? []).filter((l) => isLabourTask(l) && !l.parent_id);
}

export function findSectionByTitle(sections: Labour[], title: string) {
  return sections.find((s) => sameSectionTitle(s.description, title)) ?? null;
}

export function nextHours(current: number, delta: number) {
  return Math.max(0, Math.round((Number(current) + Number(delta)) * 100) / 100);
}

export function taskHours(list: Labour[], ids: string[]) {
  const byId = new Map(list.map((l) => [l.id, l]));
  return ids.reduce((s, id) => s + Number(byId.get(id)?.hours ?? 0), 0);
}

export function sanitizeGroupingProposal(proposal: GroupDraft[], ungrouped: Array<{ id: string }>): GroupDraft[] {
  const allowed = new Set(ungrouped.map((t) => t.id));
  const used = new Set<string>();
  const out: GroupDraft[] = [];
  for (const g of proposal) {
    const title = canonicalSectionTitle(g.title || "");
    if (!title) continue;
    const taskIds: string[] = [];
    for (const id of g.taskIds) {
      if (!allowed.has(id) || used.has(id)) continue;
      used.add(id);
      taskIds.push(id);
    }
    if (!taskIds.length) continue;
    const existing = out.find((x) => sameSectionTitle(x.title, title));
    if (existing) {
      existing.taskIds.push(...taskIds);
      if (!existing.notes) existing.notes = (g.notes ?? "").trim();
    } else {
      out.push({ title, notes: (g.notes ?? "").trim(), taskIds });
    }
  }
  return out;
}

export type GroupPersistPlan = {
  createSections: Array<{ title: string; notes: string; hours: number; taskIds: string[] }>;
  updateSections: Array<{ id: string; notes: string | null; hours: number; taskIds: string[] }>;
};

export function planGroupingPersist(drafts: GroupDraft[], labour: Labour[]): GroupPersistPlan {
  const sections = labour.filter(isLabourSection);
  const createSections: GroupPersistPlan["createSections"] = [];
  const updateSections: GroupPersistPlan["updateSections"] = [];
  for (const draft of drafts) {
    const hours = taskHours(labour, draft.taskIds);
    const existing = findSectionByTitle(sections, draft.title);
    if (!existing) {
      createSections.push({ title: draft.title, notes: draft.notes, hours, taskIds: draft.taskIds });
      continue;
    }
    const notes = existing.notes?.trim() ? existing.notes : (draft.notes || null);
    updateSections.push({
      id: existing.id,
      notes,
      hours: nextHours(Number(existing.hours), hours),
      taskIds: draft.taskIds,
    });
  }
  return { createSections, updateSections };
}

export { LABOUR_ITEM_SECTION, LABOUR_ITEM_TASK };
