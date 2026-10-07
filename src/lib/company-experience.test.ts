import { describe, expect, it } from "vitest";
import { estimateFromGuide } from "./price-guide";
import {
  buildExperience,
  correctionFactor,
  estimateWithExperience,
  labourExperience,
  productUseCount,
  productUseLabel,
  proposeLabourHours,
  sectionHourHint,
  sizeBucket,
  withoutOutliers,
  workKeyFromTitle,
  type SectionObservation,
} from "./company-experience";

function obs(partial: Partial<SectionObservation> & Pick<SectionObservation, "actualHours">): SectionObservation {
  return {
    jobId: partial.jobId ?? "j",
    bucket: partial.bucket ?? "bad",
    workKey: partial.workKey ?? "demontage",
    quotedHours: partial.quotedHours ?? 4,
    actualHours: partial.actualHours,
    hasExecutionExtra: partial.hasExecutionExtra ?? false,
  };
}

describe("company experience", () => {
  it("maps demolition titles onto the catalog key", () => {
    expect(workKeyFromTitle("Demontage")).toBe("demontage");
    expect(workKeyFromTitle("Demontage altes Lavabo")).toBe("demontage");
    expect(workKeyFromTitle("Kalt- und Warmwasser")).toBe("kalt- und warmwasser");
    expect(workKeyFromTitle("Entsorgung")).toBe("entsorgung");
    expect(workKeyFromTitle("Entsorgung")).not.toBe("demontage");
    expect(workKeyFromTitle("Siphon ersetzen")).toBeNull();
  });

  it("sizes a bathroom from fixture counts and keeps Regie separate", () => {
    expect(sizeBucket("project", { wc: 1, waschtisch: 1, dusche: 1, badewanne: 0, boiler: 0 })).toBe("bad");
    expect(sizeBucket("project", { wc: 1, waschtisch: 0, dusche: 0, badewanne: 0, boiler: 0 })).toBe("teilbad");
    expect(sizeBucket("service", { wc: 3, waschtisch: 3, dusche: 3, badewanne: 3, boiler: 3 })).toBe("regie");
  });

  it("drops a 12 h demolition and uses the median once three jobs remain", () => {
    const rows = [4, 4.1, 4.2, 12].map((actualHours, i) => obs({
      jobId: String(i),
      actualHours,
      quotedHours: actualHours === 12 ? 8 : 4,
    }));
    const stat = labourExperience(rows, "demontage", "bad");
    expect(stat.usable).toBe(true);
    expect(stat.medianHours).toBe(4.1);
    expect(stat.outliers).toBe(1);
    expect(stat.count).toBe(3);
    expect(labourExperience(rows, "demontage", "regie").usable).toBe(false);
  });

  it("does not learn a scope blow-up that was not recorded as extra work", () => {
    const rows = [
      obs({ jobId: "a", actualHours: 4 }),
      obs({ jobId: "b", actualHours: 4 }),
      obs({ jobId: "c", actualHours: 12, quotedHours: 4, hasExecutionExtra: false }),
    ];
    expect(labourExperience(rows, "demontage", "bad").usable).toBe(false);
    const kept = labourExperience([
      ...rows.slice(0, 2),
      obs({ jobId: "d", actualHours: 4.5 }),
      obs({ jobId: "c", actualHours: 4, quotedHours: 4, hasExecutionExtra: true }),
    ], "demontage", "bad");
    expect(kept.usable).toBe(true);
  });

  it("ignores one outlier among too few remaining points", () => {
    expect(withoutOutliers([4, 4, 12]).kept).toEqual([4, 4]);
    expect(labourExperience([4, 4, 12].map((actualHours) => obs({ actualHours })), "demontage", "bad").usable).toBe(false);
  });

  it("prices demolition from historical hours and the current settings rate", () => {
    const observations = [4, 4, 4.2].map((actualHours, i) => obs({ jobId: String(i), actualHours, quotedHours: 4 }));
    const guide = estimateFromGuide([], [{ description: "Demontage", hours: 8, hourly_rate: 120 }]);
    expect(guide["Demontage"]).toBe(850);
    const priced = estimateWithExperience({
      guide,
      labour: [{ description: "Demontage", hours: 8 }],
      currentRate: 130,
      bucket: "bad",
      observations,
    });
    expect(priced.amounts["Demontage"]).toBe(520);
    expect(priced.amounts["Arbeitsaufwand"]).toBe(0);
    expect(priced.amounts["Entsorgung"]).toBe(350);
    expect(priced.explanations[0]).toContain("3 ähnliche");
    expect(priced.explanations[0]).toContain("Einstellungen");
  });

  it("keeps the task hour when a section median exists", () => {
    const corrections = [
      { workKey: "demontage", suggested: 8, accepted: 4, decision: "edit" as const, fromHistory: false },
      { workKey: "demontage", suggested: 8, accepted: 4, decision: "edit" as const, fromHistory: false },
    ];
    expect(correctionFactor(corrections, "demontage")?.factor).toBe(0.5);
    const demolition = proposeLabourHours({
      description: "Demontage altes Lavabo",
      aiHours: 1.5,
      bucket: "bad",
      observations: [4, 4, 4].map((actualHours) => obs({ actualHours })),
      corrections,
    });
    expect(demolition.hours).toBe(1.5);
    expect(demolition.fromHistory).toBe(false);
    expect(demolition.explanation).toContain("etwa 4");
    const water = [12, 12, 12].map((actualHours) => obs({ actualHours, workKey: "kalt- und warmwasser", quotedHours: 12 }));
    const task = proposeLabourHours({
      description: "UP-Mischer montieren",
      aiHours: 1.5,
      bucket: "bad",
      observations: water,
      corrections: [],
    });
    expect(task.hours).toBe(1.5);
    expect(sectionHourHint("kalt- und warmwasser", "bad", water)).toContain("12");
  });

  it("keeps Regie task hours out of a bathroom total", () => {
    const built = buildExperience({
      jobs: [
        { id: "bath", jobType: "project", lifecycleStatus: "completed", status: "Abgeschlossen" },
        { id: "call", jobType: "service", lifecycleStatus: "completed", status: "Verrechnet" },
        { id: "open", jobType: "project", lifecycleStatus: "active", status: "Offerte" },
        { id: "nope", jobType: "project", lifecycleStatus: "cancelled", status: "Abgeschlossen" },
      ],
      labour: [
        { id: "s1", jobId: "bath", description: "Demontage", hours: 4, source: "manual", itemType: "section", parentId: null },
        { id: "s2", jobId: "open", description: "Demontage", hours: 20, source: "manual", itemType: "section", parentId: null },
      ],
      times: [{ labourItemId: "s1", hours: 4 }],
      materials: [
        { jobId: "bath", category: "WC", quantity: 1, actualQuantity: 1, productId: "p1" },
        { jobId: "bath", category: "Waschtisch", quantity: 1, actualQuantity: 1, productId: null },
        { jobId: "bath", category: "Dusche", quantity: 1, actualQuantity: null, productId: "p1" },
      ],
      serviceLabour: [{ jobId: "call", description: "Demontage Siphon", hours: 0.5 }],
    });
    expect(labourExperience(built.observations, "demontage", "bad").count).toBe(1);
    expect(labourExperience(built.observations, "demontage", "regie").medianHours).toBeNull();
    expect(labourExperience(built.observations, "demontage", "regie").count).toBe(1);
    expect(productUseCount(built.productUses, "p1", "bad")).toBe(1);
    expect(productUseLabel(3)).toBe("in 3 ähnlichen Aufträgen");
  });

  it("excludes a 12 h base when extras were not recorded, and keeps quoted scope separate from extra lines", () => {
    const built = buildExperience({
      jobs: [{ id: "bath", jobType: "project", lifecycleStatus: "completed", status: "Abgeschlossen" }],
      labour: [
        { id: "sec", jobId: "bath", description: "Demontage", hours: 4, source: "manual", itemType: "section", parentId: null },
        { id: "extra", jobId: "bath", description: "Demontage Überraschung", hours: 8, source: "execution", itemType: "task", parentId: null },
      ],
      times: [
        { labourItemId: "sec", hours: 4 },
        { labourItemId: "extra", hours: 8 },
      ],
      materials: [
        { jobId: "bath", category: "WC", quantity: 1, actualQuantity: 1, productId: null },
        { jobId: "bath", category: "Waschtisch", quantity: 1, actualQuantity: 1, productId: null },
        { jobId: "bath", category: "Dusche", quantity: 1, actualQuantity: 1, productId: null },
      ],
      serviceLabour: [],
    });
    expect(built.observations).toHaveLength(1);
    expect(built.observations[0]?.actualHours).toBe(4);
    expect(built.observations[0]?.hasExecutionExtra).toBe(true);
  });
});
