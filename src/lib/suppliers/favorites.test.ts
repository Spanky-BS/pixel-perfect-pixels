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

import { withLivePrice } from "./favorites";
describe("withLivePrice", () => {
  const fav = { uses: 2, lastUsed: "2026-01-01", hit: { supplierId: "richner", supplierArticleNumber: "A1", publicGrossPrice: 100, customerNetPrice: null, hasVariants: false } } as any;
  it("uses today's shop price when the article is in the live results", () => {
    const r = withLivePrice(fav, [{ ...fav.hit, publicGrossPrice: 115 }]);
    expect(r.fresh).toBe(true);
    expect(r.hit.publicGrossPrice).toBe(115);
  });
  it("keeps the old price but marks it not fresh when not found", () => {
    const r = withLivePrice(fav, [{ ...fav.hit, supplierId: "engel", publicGrossPrice: 90 }]);
    expect(r.fresh).toBe(false);
    expect(r.hit.publicGrossPrice).toBe(100);
  });
});
