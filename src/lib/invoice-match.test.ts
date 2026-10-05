import { describe, expect, it } from "vitest";
import {
  effectiveUnitEk,
  findCostDuplicate,
  invoiceIdentity,
  invoiceNetCost,
  needsBaselineHistory,
} from "./invoice-cost";
import { matchInvoiceLine, priceChanged } from "./invoice-match";
import { classifyDoc } from "./ai/extract-document";
import type { Product } from "./products";

function p(partial: Partial<Product> & { name: string }): Product {
  return {
    id: partial.id ?? "p1",
    user_id: "u",
    name: partial.name,
    description: partial.description ?? null,
    category_id: null,
    manufacturer: partial.manufacturer ?? null,
    manufacturer_article_no: partial.manufacturer_article_no ?? null,
    supplier_name: partial.supplier_name ?? null,
    supplier_article_no: partial.supplier_article_no ?? null,
    unit: "Stk",
    purchase_price: partial.purchase_price ?? null,
    sales_price: null,
    markup: null,
    notes: null,
    active: true,
    source: "manual",
    last_purchase_date: null,
    created_at: "",
    updated_at: "",
  };
}

describe("effective unit EK", () => {
  it("uses net_total / quantity when both exist", () => {
    expect(effectiveUnitEk({ quantity: 2, net_total: 180, unit_price: 100 })).toBe(90);
  });

  it("uses discounted line net over list price", () => {
    expect(effectiveUnitEk({ quantity: 1, net_total: 85.5, unit_price: 100 })).toBe(85.5);
  });

  it("falls back to unit_price without line net", () => {
    expect(effectiveUnitEk({ quantity: 3, net_total: null, unit_price: 12.5 })).toBe(12.5);
  });
});

describe("invoice product matching", () => {
  it("matches manufacturer article number first", () => {
    const lib = [p({ id: "a", name: "Sigma", manufacturer_article_no: "111.300.00.5", purchase_price: 401.2 })];
    const m = matchInvoiceLine(
      { description: "Spülkasten", manufacturer: "Geberit", manufacturer_article_no: "111.300.00.5", supplier_article_no: "x", supplier_name: "Richner", unit_price: 401.2 },
      lib,
    );
    expect(m.kind).toBe("exact_match");
    expect(m.product?.id).toBe("a");
  });

  it("flags a meaningful EK change using effective EK", () => {
    const lib = [p({ id: "a", name: "Sigma", manufacturer_article_no: "111.300.00.5", purchase_price: 401.2 })];
    const ek = effectiveUnitEk({ quantity: 1, net_total: 417.8, unit_price: 450 });
    const m = matchInvoiceLine(
      { description: "Spülkasten", manufacturer: null, manufacturer_article_no: "111300005", supplier_article_no: null, supplier_name: null, unit_price: ek },
      lib,
    );
    expect(m.kind).toBe("price_change");
    expect(m.changePct).toBe(4.1);
  });

  it("does not auto-merge similar names (probable duplicate)", () => {
    const lib = [p({ id: "c", name: "Geberit Sigma UP320 Unterputzspülkasten", manufacturer: "Geberit", purchase_price: 400 })];
    const m = matchInvoiceLine(
      { description: "Geberit Sigma UP320", manufacturer: "Geberit", manufacturer_article_no: null, supplier_article_no: null, supplier_name: null, unit_price: 400 },
      lib,
    );
    expect(m.kind).toBe("probable_match");
    expect(m.product?.id).toBe("c");
  });

  it("treats tiny price deltas as unchanged", () => {
    expect(priceChanged(100, 100.2)).toBe(false);
    expect(priceChanged(100, 102)).toBe(true);
  });
});

describe("duplicate invoice protection", () => {
  it("keys on supplier + invoice number", () => {
    expect(invoiceIdentity(" Richner AG ", " RE-9 ")).toBe("richner ag|re-9");
  });

  it("finds an already included invoice", () => {
    const rows = [{ id: "old", supplier_name: "Richner", invoice_number: "RE-9", job_id: "j1" }];
    const dup = findCostDuplicate(rows, "richner", "RE-9", "new");
    expect(dup?.id).toBe("old");
  });

  it("ignores self and missing keys", () => {
    const rows = [{ id: "old", supplier_name: "Richner", invoice_number: "RE-9" }];
    expect(findCostDuplicate(rows, "Richner", "RE-9", "old")).toBeNull();
    expect(findCostDuplicate(rows, "Richner", null, "x")).toBeNull();
  });
});

describe("net vs gross cost", () => {
  it("uses net_total", () => {
    expect(invoiceNetCost({ net_total: 100, gross_total: 108.1, vat_amount: 8.1 }, [])).toEqual({ complete: true, net: 100 });
  });

  it("uses line nets when header net missing", () => {
    expect(invoiceNetCost({ net_total: null, gross_total: 200 }, [{ net_total: 40 }, { net_total: 60 }])).toEqual({ complete: true, net: 100 });
  });

  it("never treats gross-only as net", () => {
    const r = invoiceNetCost({ net_total: null, vat_amount: null, gross_total: 500 }, [{ net_total: null }]);
    expect(r.complete).toBe(false);
    expect(r.net).toBeNull();
  });

  it("allows gross minus VAT", () => {
    expect(invoiceNetCost({ net_total: null, gross_total: 108.1, vat_amount: 8.1 }, [])).toEqual({ complete: true, net: 100 });
  });
});

describe("price history preservation", () => {
  it("needs a baseline when master price is not yet recorded", () => {
    expect(needsBaselineHistory([], 400)).toBe(true);
    expect(needsBaselineHistory([400], 400)).toBe(false);
    expect(needsBaselineHistory([420], 400)).toBe(true);
  });
});

describe("csv extract", () => {
  it("reads csv bytes as text", async () => {
    const { extractDocumentBytes } = await import("./ai/extract-document");
    const r = await extractDocumentBytes(new TextEncoder().encode("Art;Menge\nA;2"), { fileName: "liste.csv" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("Art;Menge");
  });
});

describe("document classify", () => {
  it("classifies pdf csv excel image", () => {
    expect(classifyDoc("a.pdf")).toBe("pdf");
    expect(classifyDoc("list.csv")).toBe("csv");
    expect(classifyDoc("m.xlsx")).toBe("excel");
    expect(classifyDoc("plan.png")).toBe("image");
    expect(classifyDoc("scan.dwg")).toBe("other");
  });
});
