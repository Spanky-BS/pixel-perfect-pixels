import { describe, expect, it } from "vitest";
import { rankFavorites, type PickedProduct } from "./favorites";

const row = (o: Partial<PickedProduct>): PickedProduct => ({ name: "Handbrause X", description: null, manufacturer: "Hansgrohe", manufacturer_article_no: null, supplier_article_no: "A1", unit: "Stk", purchase_price: 50, source: "richner-public", created_at: "2026-01-01", ...o });

describe("rankFavorites", () => {
  it("puts the most used article first", () => {
    const r = rankFavorites([row({ supplier_article_no: "B", name: "Handbrause B" }), row({}), row({}), row({})], "handbrause");
    expect(r[0]!.hit.supplierArticleNumber).toBe("A1");
    expect(r[0]!.uses).toBe(3);
  });
  it("only shows articles matching all search words", () => {
    expect(rankFavorites([row({})], "handbrause laufen")).toHaveLength(0);
  });
  it("uses the latest picked price", () => {
    const r = rankFavorites([row({ purchase_price: 40 }), row({ purchase_price: 55, created_at: "2026-05-01" })], "handbrause");
    expect(r[0]!.hit.publicGrossPrice).toBe(55);
  });
  it("ignores manually entered products", () => {
    expect(rankFavorites([row({ source: "manual" })], "handbrause")).toHaveLength(0);
  });
});
