import { describe, expect, it } from "vitest";
import { estimateFromGuide, matchGuide } from "./price-guide";

describe("price guide", () => {
  it("Wand-WC uses midpoint 800 CHF", () => {
    expect(estimateFromGuide([{ description: "Wand-WC weiss", quantity: 1 }], [])["Sanitärapparate"]).toBe(800);
  });
  it("Unterbaumöbel beats generic Waschtisch", () => {
    expect(matchGuide("Waschtisch Unterbaumöbel 80cm")?.low).toBe(1200);
  });
  it("labour = hours x rate", () => {
    expect(estimateFromGuide([], [{ description: "Montage", hours: 4, hourly_rate: 120 }])["Arbeitsaufwand"]).toBe(480);
  });
  it("demolition adds Demontage 850 and Entsorgung 350", () => {
    const r = estimateFromGuide([], [{ description: "Demontage altes Lavabo", hours: 1, hourly_rate: 120 }]);
    expect(r["Demontage"]).toBe(850);
    expect(r["Entsorgung"]).toBe(350);
  });
});

import { breakdownFromGuide } from "./price-guide";
describe("breakdownFromGuide", () => {
  it("keeps the same totals as before and lines add up per package", () => {
    const mats = [{ description: "Wand-WC", quantity: 1, category: "WC" }, { description: "Waschtisch 80 cm", quantity: 1 }];
    const lab = [{ description: "Demontage altes Bad", hours: 6, hourly_rate: 130 }];
    const b = breakdownFromGuide(mats, lab);
    expect(b.amounts).toEqual(estimateFromGuide(mats, lab));
    expect(b.amounts["Arbeitsaufwand"]).toBe(780);
    for (const [s, lines] of Object.entries(b.details)) {
      expect(Math.abs(lines.reduce((a, l) => a + l.amount, 0) - (b.amounts[s] ?? 0))).toBeLessThanOrEqual(lines.length);
    }
  });
});
