import { describe, expect, it } from "vitest";
import type { Labour } from "./app";
import { quotedLabour } from "./project-quote";
import {
  canonicalSectionTitle,
  childTasks,
  findSectionByTitle,
  nextHours,
  normalizeAnalyseTask,
  resolveWorkKey,
  planGroupingPersist,
  sameSectionTitle,
  sanitizeGroupingProposal,
  ungroupedTasks,
} from "./labour-grouping";

function row(partial: Partial<Labour> & Pick<Labour, "id" | "description">): Labour {
  return {
    confidence: null,
    created_at: "",
    hourly_rate: 120,
    hours: 1,
    item_type: "section",
    job_id: "j",
    notes: null,
    parent_id: null,
    sort_order: 0,
    source: "manual",
    updated_at: "",
    user_id: "u",
    work_key: null,
    ...partial,
  };
}

describe("analyse work keys", () => {
  it("keeps Entsorgung as its own catalog key", () => {
    expect(resolveWorkKey("Entsorgung")).toBe("entsorgung");
    expect(resolveWorkKey("Entsorgung")).not.toBe("demontage");
    expect(resolveWorkKey("Entsorgung")).not.toBe("unvorhergesehenes");
  });

  it("leaves an unknown category unassigned", () => {
    expect(resolveWorkKey("")).toBeNull();
    expect(resolveWorkKey("Irgendwas")).toBeNull();
    expect(resolveWorkKey("Entsorgung von Bauschutt")).toBeNull();
    expect(resolveWorkKey("Unvorhergesehenes")).toBe("unvorhergesehenes");
    const task = normalizeAnalyseTask({ description: "UP-Mischer montieren", category: "Spezialarbeit", hours: null });
    expect(task.workKey).toBeNull();
    expect(task.hours).toBeNull();
    expect(normalizeAnalyseTask({ description: "Lavabo demontieren", category: "Demontage", hours: 1.5 }).hours).toBe(1.5);
  });
});

describe("labour grouping", () => {
  it("treats Warm- und Kaltwasser as the same default section", () => {
    expect(sameSectionTitle("Warm- und Kaltwasser", "Kalt- und Warmwasser")).toBe(true);
    expect(canonicalSectionTitle("Warm- und Kaltwasser")).toBe("Kalt- und Warmwasser");
    expect(sameSectionTitle("Kaltwasser", "Kalt- und Warmwasser")).toBe(false);
  });

  it("keeps ungrouped tasks out of commercial quote lines", () => {
    const rows = [
      row({ id: "s1", description: "Demontage", item_type: "section", hours: 2 }),
      row({ id: "t1", description: "WC demontieren", item_type: "task", hours: 1 }),
      row({ id: "x1", description: "Zusatz", source: "execution", hours: 0 }),
    ];
    expect(quotedLabour(rows).map((l) => l.id)).toEqual(["s1"]);
    expect(ungroupedTasks(rows).map((l) => l.id)).toEqual(["t1"]);
  });

  it("lists grouped tasks under their section only", () => {
    const rows = [
      row({ id: "s1", description: "Schmutzwasser", item_type: "section" }),
      row({ id: "t1", description: "Bodenrinne", item_type: "task", parent_id: "s1" }),
      row({ id: "t2", description: "offen", item_type: "task", parent_id: null }),
    ];
    expect(childTasks(rows, "s1").map((l) => l.id)).toEqual(["t1"]);
    expect(ungroupedTasks(rows).map((l) => l.id)).toEqual(["t2"]);
  });

  it("ignores already grouped or unknown task ids in an AI proposal", () => {
    const ungrouped = [row({ id: "t1", description: "A", item_type: "task" })];
    const out = sanitizeGroupingProposal(
      [
        { title: "Schmutzwasser", notes: "Ausgeführt wie folgt: …", taskIds: ["t1", "t1", "missing"] },
        { title: "", notes: "", taskIds: ["t1"] },
      ],
      ungrouped,
    );
    expect(out).toEqual([{ title: "Schmutzwasser", notes: "Ausgeführt wie folgt: …", taskIds: ["t1"] }]);
  });

  it("adds newly assigned hours to an existing section instead of overwriting", () => {
    const labour = [
      row({ id: "s1", description: "Schmutzwasser", item_type: "section", hours: 4, notes: "bereits gesetzt" }),
      row({ id: "t1", description: "Bodenrinne", item_type: "task", hours: 1.5 }),
    ];
    const plan = planGroupingPersist(
      [{ title: "Schmutzwasser", notes: "soll nicht überschreiben", taskIds: ["t1"] }],
      labour,
    );
    expect(plan.createSections).toHaveLength(0);
    expect(plan.updateSections[0]).toMatchObject({ id: "s1", hours: 5.5, notes: "bereits gesetzt", taskIds: ["t1"] });
  });

  it("creates a missing section from the catalog title", () => {
    const labour = [row({ id: "t1", description: "Leitung", item_type: "task", hours: 3 })];
    const plan = planGroupingPersist(
      [{ title: "Kalt- und Warmwasser", notes: "Ausgeführt wie folgt: Leitungen.", taskIds: ["t1"] }],
      labour,
    );
    expect(findSectionByTitle([], "Kalt- und Warmwasser")).toBeNull();
    expect(plan.createSections[0]).toMatchObject({ title: "Kalt- und Warmwasser", hours: 3, taskIds: ["t1"] });
  });

  it("applies hour deltas without going negative", () => {
    expect(nextHours(2, -0.5)).toBe(1.5);
    expect(nextHours(1, -3)).toBe(0);
  });
});
