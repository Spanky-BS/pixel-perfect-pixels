import type { CatalogHit, CatalogSupplier } from "./catalog";

/** A product row previously snapshotted from a supplier catalogue. */
export type PickedProduct = {
  name: string; description: string | null; manufacturer: string | null; manufacturer_article_no: string | null;
  supplier_article_no: string | null; unit: string; purchase_price: number | null; source: string; created_at: string;
};
export type Favorite = { hit: CatalogHit; uses: number; lastUsed: string };

/** Group earlier picks per article, keep only those matching every search word, most used first. */
export function rankFavorites(rows: PickedProduct[], query: string, limit = 8): Favorite[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const map = new Map<string, Favorite>();
  for (const r of rows) {
    if (!r.source.endsWith("-public") || r.purchase_price == null) continue;
    const supplierId = r.source.slice(0, -7) as CatalogSupplier;
    const key = `${supplierId}|${r.supplier_article_no ?? r.name}`;
    const prev = map.get(key);
    if (prev) {
      prev.uses++;
      if (r.created_at > prev.lastUsed) { prev.lastUsed = r.created_at; prev.hit.publicGrossPrice = r.purchase_price; }
      continue;
    }
    map.set(key, {
      uses: 1, lastUsed: r.created_at,
      hit: {
        supplierId, productId: key, variantId: null, supplierArticleNumber: r.supplier_article_no,
        manufacturer: r.manufacturer, manufacturerArticleNumber: r.manufacturer_article_no,
        productName: r.name, description: r.description, imageUrl: null, detailUrl: null,
        priceUnit: r.unit, priceUnitQuantity: 1, currency: "CHF", publicGrossPrice: r.purchase_price,
        customerNetPrice: null, vatIncluded: null, availabilityStatus: null, stockQuantity: null,
        hasVariants: false, lastUpdated: r.created_at, source: "public",
      },
    });
  }
  return [...map.values()]
    .filter((f) => {
      const hay = [f.hit.productName, f.hit.manufacturer, f.hit.supplierArticleNumber, f.hit.manufacturerArticleNumber].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit);
}

/** Swap a favourite's stored snapshot for today's live hit (same supplier + article number). */
export function withLivePrice(fav: Favorite, liveHits: CatalogHit[]): { hit: CatalogHit; fresh: boolean } {
  const art = fav.hit.supplierArticleNumber;
  const live = art ? liveHits.find((h) => h.supplierId === fav.hit.supplierId && h.supplierArticleNumber === art && !h.hasVariants && unitPriceOf(h) != null) : undefined;
  return live ? { hit: live, fresh: true } : { hit: fav.hit, fresh: false };
}
const unitPriceOf = (h: CatalogHit) => h.customerNetPrice ?? h.publicGrossPrice;
