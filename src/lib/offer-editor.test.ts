import { describe, expect, it } from "vitest";
import { discountedAmount, moveOfferRow, parseOfferTextRows } from "./offer-editor";

describe("offer editor", () => {
  it("applies a 10% position discount to the net amount", () => {
    expect(discountedAmount(200, 10)).toBe(180);
  });

  it("supports a 100% discount and clamps invalid percentages", () => {
    expect(discountedAmount(125, 100)).toBe(0);
    expect(discountedAmount(125, -5)).toBe(125);
    expect(discountedAmount(125, 110)).toBe(0);
  });

  it("parses only valid free-text rows and keeps their style", () => {
    const value = [
      { id: "a", rubric: "254.0", text: "Kellerverteilung", style: "heading", sort_order: 0 },
      { id: "b", rubric: "254.0", text: "Inklusive Dichtigkeitsprüfung.", style: "text", sort_order: 1 },
      { id: "broken", rubric: "254.0", text: "Ohne Stil", sort_order: 2 },
    ];
    expect(parseOfferTextRows(value).map((r) => r.style)).toEqual(["heading", "text"]);
  });

  it("moves a row by drag-and-drop within its rubric", () => {
    const rows = [
      { id: "a", rubric: "250", sort_order: 0 },
      { id: "b", rubric: "250", sort_order: 1 },
      { id: "c", rubric: "250", sort_order: 2 },
    ];
    const next = moveOfferRow(rows, "c", "a");
    expect(next.map((r) => [r.id, r.sort_order])).toEqual([["c", 0], ["a", 1], ["b", 2]]);
  });

  it("moves a downward drag after the hovered row", () => {
    const rows = [
      { id: "a", rubric: "250", sort_order: 0 },
      { id: "b", rubric: "250", sort_order: 1 },
      { id: "c", rubric: "250", sort_order: 2 },
    ];
    expect(moveOfferRow(rows, "a", "b").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("moves a row to another rubric and renumbers both rubrics", () => {
    const rows = [
      { id: "a", rubric: "250", sort_order: 0 },
      { id: "b", rubric: "250", sort_order: 1 },
      { id: "c", rubric: "254.0", sort_order: 0 },
    ];
    const next = moveOfferRow(rows, "a", "c");
    expect(next.find((r) => r.id === "a")).toMatchObject({ rubric: "254.0", sort_order: 0 });
    expect(next.find((r) => r.id === "b")).toMatchObject({ rubric: "250", sort_order: 0 });
    expect(next.find((r) => r.id === "c")).toMatchObject({ rubric: "254.0", sort_order: 1 });
  });

  it("drops a row at the end of an empty rubric", () => {
    const rows = [{ id: "a", rubric: "250", sort_order: 0 }];
    expect(moveOfferRow(rows, "a", "rubric:253")[0]).toMatchObject({ rubric: "253", sort_order: 0 });
  });
});
