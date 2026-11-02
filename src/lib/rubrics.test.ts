import { describe, expect, it } from "vitest";
import { effectiveExclusions, groupByRubric, guessRubric } from "./rubrics";

describe("rubrics", () => {
  it("classifies typical positions", () => {
    expect(guessRubric("Demontage 1 Pissoir")).toBe("259.0");
    expect(guessRubric("Kernbohrung D 100")).toBe("259.1");
    expect(guessRubric("Schmutzwasser Fallleitung")).toBe("254.2");
    expect(guessRubric("Warmwasserleitung Bad")).toBe("254.1");
    expect(guessRubric("Kaltwasser Zuleitung")).toBe("254.0");
    expect(guessRubric("Wärmepumpenboiler 300 l")).toBe("253");
    expect(guessRubric("Montage 1 Pissoir")).toBe("250");
    expect(guessRubric("Unvorhergesehenes")).toBe("259.2");
  });

  it("explicit rubric wins over text", () => {
    const g = groupByRubric([{ description: "Demontage", rubric: "252", a: 10 }], (r) => r.a);
    expect(g[0]!.rubrics[0]!.rubric.code).toBe("252");
  });

  it("groups 254.x under Sanitärleitungen with subtotals and main total", () => {
    const rows = [
      { description: "Kaltwasser", a: 100 },
      { description: "Warmwasser", a: 50 },
      { description: "Schmutzwasser", a: 25 },
      { description: "Demontage", a: 10 },
    ];
    const g = groupByRubric(rows, (r) => r.a);
    expect(g.map((m) => m.group)).toEqual(["254", "259"]);
    expect(g[0]!.rubrics.map((r) => [r.rubric.code, r.total])).toEqual([["254.0", 100], ["254.1", 50], ["254.2", 25]]);
    expect(g[0]!.total).toBe(175);
  });

  it("exclusions: job list (even empty) overrides settings defaults", () => {
    expect(effectiveExclusions(null, ["A"])).toEqual(["A"]);
    expect(effectiveExclusions([], ["A"])).toEqual([]);
    expect(effectiveExclusions(["B"], ["A"])).toEqual(["B"]);
  });
});
