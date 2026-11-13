import { describe, expect, it } from "vitest";
import { isOfferLocked, isQuotedLabour, normalizeStatus, PROJECT_STEPS } from "./app";
import { computeQuote, labourQuoteAmount, quotedLabour } from "./project-quote";
import type { Labour } from "./app";

describe("project quote helpers", () => {
  it("keeps quoted labour separate from execution extras", () => {
    const rows = [
      { source: "manual", hours: 4, hourly_rate: 120 },
      { source: "execution", hours: 0, hourly_rate: 0 },
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
    expect([...PROJECT_STEPS]).toEqual(["Begehung", "Grobkosten", "Offerte", "Ausführung", "Rechnung", "Abgeschlossen"]);
    expect(normalizeStatus("project", "Produktauswahl")).toBe("Offerte");
  });

  it("applies labour discounts to quote totals", () => {
    const t = computeQuote(
      [{ hours: 2, hourly_rate: 100, discount: 10, source: "manual" } as Labour],
      [],
      8.1,
      0,
    );
    expect(t.labourTotal).toBe(180);
    expect(t.subtotal).toBe(180);
    expect(t.discountTotal).toBe(20);
    expect(t.vat).toBe(14.58);
  });

  it("applies material discounts before VAT", () => {
    const t = computeQuote(
      [],
      [{
        quantity: 2,
        discount: 25,
        products: { purchase_price: 40, sales_price: 100, markup_percent: null },
      } as never],
      8.1,
      0,
    );
    expect(t.materialTotal).toBe(150);
    expect(t.subtotalBeforeDiscount).toBe(200);
    expect(t.discountTotal).toBe(50);
    expect(t.vat).toBe(12.15);
  });

  it("computes quote totals from quoted labour only", () => {
    const t = computeQuote(
      [
        { hours: 2, hourly_rate: 100, source: "manual" } as Labour,
        { hours: 3, hourly_rate: 100, source: "execution" } as Labour,
      ],
      [],
      8.1,
      0,
    );
    expect(t.hours).toBe(2);
    expect(t.labourTotal).toBe(200);
    expect(t.vat).toBe(16.2);
  });
});
