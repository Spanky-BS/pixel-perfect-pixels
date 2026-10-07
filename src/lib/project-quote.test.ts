import { describe, expect, it } from "vitest";
import { isOfferLocked, isQuotedLabour, normalizeStatus, PROJECT_STEPS, STANDARD_WORK_POSITIONS } from "./app";
import { computeQuote, labourQuoteAmount, quotedLabour } from "./project-quote";
import type { Labour } from "./app";

describe("project quote helpers", () => {
  it("keeps quoted labour separate from execution extras", () => {
    const rows = [
      { source: "manual", item_type: "section", hours: 4, hourly_rate: 120 },
      { source: "execution", item_type: "section", hours: 0, hourly_rate: 0 },
    ] as Labour[];
    expect(quotedLabour(rows)).toHaveLength(1);
    expect(isQuotedLabour(rows[1]!)).toBe(false);
    expect(labourQuoteAmount(rows[0]!)).toBe(480);
  });

  it("does not treat viewing later stages as locked until Ausführung", () => {
    expect(isOfferLocked("Offerte")).toBe(false);
    expect(isOfferLocked("Kalkulation")).toBe(false);
    expect(isOfferLocked("Ausführung")).toBe(true);
    expect(isOfferLocked("Auftrag")).toBe(true);
    expect(isOfferLocked("Rechnung")).toBe(true);
  });

  it("exposes the simplified project steps", () => {
    expect([...PROJECT_STEPS]).toEqual(["Begehung", "Analyse", "Grobkosten", "Offerte", "Ausführung", "Rechnung", "Abgeschlossen"]);
    expect(normalizeStatus("project", "Produktauswahl")).toBe("Offerte");
  });

  it("uses one default water section", () => {
    expect([...STANDARD_WORK_POSITIONS]).toContain("Kalt- und Warmwasser");
    expect([...STANDARD_WORK_POSITIONS]).not.toContain("Kaltwasser");
    expect([...STANDARD_WORK_POSITIONS]).not.toContain("Warmwasser");
    expect([...STANDARD_WORK_POSITIONS]).not.toContain("Warm- und Kaltwasser");
  });

  it("computes quote totals from quoted labour only", () => {
    const t = computeQuote(
      [
        { hours: 2, hourly_rate: 100, source: "manual", item_type: "section" } as Labour,
        { hours: 3, hourly_rate: 100, source: "execution", item_type: "section" } as Labour,
      ],
      [],
      8.1,
      0,
    );
    expect(t.hours).toBe(2);
    expect(t.labourTotal).toBe(200);
    expect(t.vat).toBe(16.2);
  });

  it("does not bill ungrouped analysis tasks", () => {
    const rows = [
      { source: "manual", item_type: "section", hours: 2, hourly_rate: 100 },
      { source: "ai", item_type: "task", hours: 8, hourly_rate: 100, parent_id: null },
    ] as Labour[];
    expect(quotedLabour(rows)).toHaveLength(1);
    expect(computeQuote(rows, [], 8.1, 0).labourTotal).toBe(200);
  });
});
