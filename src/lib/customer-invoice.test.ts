import { describe, expect, it } from "vitest";
import { addDays, ibanStatus, invoiceLinesFromActuals, invoiceTotals, nextInvoiceNumber, qrBillData, qrReferenceFor } from "./customer-invoice";
import { isQRReferenceValid } from "swissqrbill/utils";

describe("customer invoice", () => {
  it("bills effective hours and used material, not the offer", () => {
    const r = invoiceLinesFromActuals({
      labour: [
        { id: "a", description: "Montage Pissoir", hourly_rate: 130 },
        { id: "b", description: "Demontage", hourly_rate: 130 },
      ],
      times: [{ labour_item_id: "a", hours: 2.5 }, { labour_item_id: "a", hours: 1.5 }],
      materials: [
        { description: "Pissoir", unit: "Stk", quantity: 2, actual_quantity: 1, products: { sales_price: 400, purchase_price: null, markup: null } as never },
        { description: "Ohne Preis", unit: "Stk", quantity: 1, products: null },
      ],
      defaultRate: 120,
      markup: 0,
    });
    expect(r.lines).toEqual([
      { kind: "arbeit", description: "Montage Pissoir", qty: 4, unit: "h", price: 130, amount: 520 },
      { kind: "material", description: "Pissoir", qty: 1, unit: "Stk", price: 400, amount: 400 },
    ]);
    expect(r.hours).toBe(4);
    expect(r.unpriced).toBe(1);
  });

  it("adds 8.1% VAT, rounds to 5 Rappen and deducts Akonto", () => {
    const t = invoiceTotals(1000, 8.1, 500);
    expect(t.vat).toBe(81);
    expect(t.total).toBe(1081);
    expect(t.amountDue).toBe(581);
    expect(invoiceTotals(100.01, 8.1).total).toBe(108.1);
  });

  it("numbers invoices per year", () => {
    expect(nextInvoiceNumber(["RE-2026-001", "RE-2026-009", "RE-2025-044"], 2026)).toBe("RE-2026-010");
    expect(nextInvoiceNumber([], 2027)).toBe("RE-2027-001");
  });

  it("due dates: 30 days for invoices, 14 for Akonto", () => {
    expect(addDays("2026-10-31", 30)).toBe("2026-11-30");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("validates the IBAN for the QR slip", () => {
    expect(ibanStatus("")).toBe("missing");
    expect(ibanStatus("CH93 0076 2011 6238 5295 7")).toBe("ok");
    expect(ibanStatus("CH93 0076 2011 6238 5295 8")).toBe("invalid");
  });

  it("uses a valid QR reference only with a QR-IBAN", () => {
    expect(isQRReferenceValid(qrReferenceFor("RE-2026-007"))).toBe(true);
    const normal = qrBillData({ iban: "CH9300762011623852957", companyName: "Haustechnik", amount: 581, number: "RE-2026-007" });
    expect(normal.reference).toBeUndefined();
    const qr = qrBillData({ iban: "CH4431999123000889012", companyName: "Haustechnik", amount: 581, number: "RE-2026-007" });
    expect(qr.reference).toBe(qrReferenceFor("RE-2026-007"));
  });
});
