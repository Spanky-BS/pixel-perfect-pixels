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
  it("demolition labour goes to Demontage, not Arbeitsaufwand", () => {
    const r = estimateFromGuide([], [{ description: "Demontage 2 x WC", hours: 2, hourly_rate: 120 }]);
    expect(r["Demontage"]).toBe(240);
    expect(r["Arbeitsaufwand"]).toBeUndefined();
  });
  it("Entsorgung minimum 150 for 3 parts", () => {
    const r = estimateFromGuide([], [{ description: "Demontage 2 x WC", hours: 1.5, hourly_rate: 120 }, { description: "Demontage 1 x Pissoir", hours: 0.75, hourly_rate: 120 }]);
    expect(r["Entsorgung"]).toBe(150);
  });
  it("Entsorgung 40 CHF per part: 5 parts = 200", () => {
    const r = estimateFromGuide([], [{ description: "Demontage 5 x Papierhalter", hours: 1, hourly_rate: 120 }]);
    expect(r["Entsorgung"]).toBe(200);
  });
  it("flat Demontage 850 only without demolition hours", () => {
    expect(estimateFromGuide([{ description: "Demontage altes Lavabo", quantity: 1 }], [])["Demontage"]).toBe(850);
    expect(estimateFromGuide([], [{ description: "Demontage Lavabo", hours: 1, hourly_rate: 120 }])["Demontage"]).toBe(120);
  });
});

import { breakdownFromGuide as bd, estimateFromGuide as ef } from "./price-guide";
import { normalizeStatus as ns } from "./app";
describe("grobkosten workflow", () => {
  it("breakdown lines add up to the section amounts", () => {
    const m = [{ description: "Wand-WC", quantity: 1 }, { description: "Eckventil", quantity: 2 }];
    const l = [{ description: "Montage", hours: 4, hourly_rate: 120 }];
    const sum = bd(m, l).filter((x) => x.section === "Arbeitsaufwand").reduce((s, x) => s + x.amount, 0);
    expect(sum).toBe(ef(m, l)["Arbeitsaufwand"]);
    expect(sum).toBe(480);
  });
  it("old Analyse status maps onto Grobkosten", () => {
    expect(ns("project", "Analyse")).toBe("Grobkosten");
  });
});
