/**
 * Shared supplier catalogue model + pure parsers (no network).
 * Prices here are the shops' PUBLIC prices; customer net prices come later per company login.
 */
export type CatalogSupplier = "richner" | "engel" | "pestalozzi" | "sanitas";

export const CATALOG_SUPPLIERS: { id: CatalogSupplier; name: string; connected: boolean }[] = [
  { id: "richner", name: "Richner", connected: true },
  { id: "engel", name: "ENGEL", connected: true },
  { id: "pestalozzi", name: "Pestalozzi", connected: true },
  { id: "sanitas", name: "Sanitas Troesch", connected: false },
];

export type CatalogHit = {
  supplierId: CatalogSupplier;
  productId: string;
  variantId: string | null;
  supplierArticleNumber: string | null;
  manufacturer: string | null;
  manufacturerArticleNumber: string | null;
  productName: string;
  description: string | null;
  imageUrl: string | null;
  detailUrl: string | null;
  /** Unit the price refers to (Stk, m …). */
  priceUnit: string | null;
  /** Price is for this many units (e.g. 10 → price per 10 Stk). */
  priceUnitQuantity: number;
  currency: "CHF";
  publicGrossPrice: number | null;
  customerNetPrice: number | null;
  vatIncluded: boolean | null;
  availabilityStatus: string | null;
  stockQuantity: number | null;
  /** ENGEL search hits have no price yet; variants must be loaded. */
  hasVariants: boolean;
  lastUpdated: string;
  source: "public";
};

export type SupplierResult = {
  supplierId: CatalogSupplier;
  hits: CatalogHit[];
  total: number | null;
  partial: boolean;
  error: string | null;
};

/** Price for exactly one unit, or null. Never treats a "per 10" price as a piece price. */
export function unitPrice(h: Pick<CatalogHit, "publicGrossPrice" | "customerNetPrice" | "priceUnitQuantity">) {
  const p = h.customerNetPrice ?? h.publicGrossPrice;
  if (p == null || !Number.isFinite(p)) return null;
  const q = h.priceUnitQuantity > 0 ? h.priceUnitQuantity : 1;
  return Math.round((p / q) * 10000) / 10000;
}

const UNIT: Record<string, string> = { STK: "Stk", SK: "Stk", ST: "Stk", M: "m", MTR: "m", PAA: "Paar", SET: "Set", PAK: "Pak", KG: "kg", L: "l" };
export function normUnit(u: unknown) {
  if (typeof u !== "string" || !u.trim()) return null;
  return UNIT[u.trim().toUpperCase()] ?? u.trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const now = () => new Date().toISOString();

/* ---------- Richner ---------- */
export function mapRichnerProducts(json: unknown): { hits: CatalogHit[]; total: number | null } {
  const d = (json ?? {}) as R;
  const list: R[] = Array.isArray(d.products) ? d.products : [];
  const hits = list.map((p): CatalogHit => {
    const id = String(p.productIdentification?.suppliersProductIdentification?.suppliersProductId ?? "");
    const desc = p.productDescriptions ?? {};
    const img = p.attachments?.images?.[0]?.attachmentIdentification ?? null;
    return {
      supplierId: "richner",
      productId: id,
      variantId: null,
      supplierArticleNumber: id || null,
      manufacturer: desc.brand ?? null,
      manufacturerArticleNumber: p.productIdentification?.manufacturersProductIdentification?.manufacturersProductId ?? null,
      productName: desc.productDescription ?? id,
      description: desc.longProductDescription ?? null,
      imageUrl: img,
      detailUrl: null, // product URL pattern not confirmed
      priceUnit: normUnit(p.orderConditions?.pricingUoM?.unitCode),
      priceUnitQuantity: 1,
      currency: "CHF",
      publicGrossPrice: null,
      customerNetPrice: null,
      vatIncluded: null,
      availabilityStatus: null,
      stockQuantity: null,
      hasVariants: false,
      lastUpdated: now(),
      source: "public",
    };
  }).filter((h) => h.productId);
  return { hits, total: typeof d.count === "number" ? d.count : null };
}

/** { "01526984": [{ grossPrice, priceBase: { numberOfUnits, unitOfMeasurement } , isPriceOnRequest }] } */
export function applyRichnerPrices(hits: CatalogHit[], prices: unknown, stocks: unknown) {
  const pr = (prices ?? {}) as R;
  const st = (stocks ?? {}) as R;
  return hits.map((h) => {
    const p = Array.isArray(pr[h.productId]) ? pr[h.productId][0] : null;
    const s = Array.isArray(st[h.productId]) ? st[h.productId][0] : null;
    const gross = p && !p.isPriceOnRequest && typeof p.grossPrice === "number" ? p.grossPrice : null;
    const n = Number(p?.priceBase?.numberOfUnits);
    return {
      ...h,
      publicGrossPrice: gross,
      priceUnitQuantity: n > 0 ? n : 1,
      priceUnit: normUnit(p?.priceBase?.unitOfMeasurement?.unitCode) ?? h.priceUnit,
      stockQuantity: typeof s?.stockQuantity === "number" ? s.stockQuantity : null,
      availabilityStatus: typeof s?.stockQuantity === "number" ? (s.stockQuantity > 0 ? "an Lager" : "nicht an Lager") : null,
    };
  });
}

/* ---------- ENGEL ---------- */
const decode = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function parseEngelSearch(json: unknown): { hits: CatalogHit[]; total: number | null } {
  const html = String(((json ?? {}) as R).vLeft ?? "");
  const totalM = html.match(/data-treffer="(\d+)"/);
  const hits: CatalogHit[] = [];
  const re = /<a[^>]*href="([^"]*artid=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, href, artid, inner] = m;
    const spans = [...inner!.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((x) => decode(x[1]!));
    const img = inner!.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null;
    if (!spans[0]) continue;
    hits.push({
      supplierId: "engel", productId: artid!, variantId: null,
      supplierArticleNumber: spans[1] ?? null, manufacturer: null,
      manufacturerArticleNumber: null, productName: spans[0], description: null, imageUrl: img,
      detailUrl: `https://shop.engel.ch${decode(href!)}`, priceUnit: null, priceUnitQuantity: 1, currency: "CHF",
      publicGrossPrice: null, customerNetPrice: null, vatIncluded: false, availabilityStatus: null, stockQuantity: null,
      hasVariants: true, lastUpdated: now(), source: "public",
    });
  }
  if (html.trim() && !hits.length && totalM && Number(totalM[1]) > 0) throw new Error("ENGEL-Format geändert");
  return { hits, total: totalM ? Number(totalM[1]) : hits.length };
}

/** Variant rows (gt-row-body) with prices in #groessePreis_{id}. Rows without a clean price are dropped. */
export function parseEngelVariants(html: string, base: CatalogHit): CatalogHit[] {
  const name = decode(html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? base.productName);
  const rows = html.split(/<div class="gt-row gt-row-body/).slice(1);
  const out: CatalogHit[] = [];
  for (const row of rows) {
    const id = row.match(/data-groesseId="(\d+)"/)?.[1];
    if (!id) continue;
    const nr = row.match(/data-groesseNr="([^"]+)"/)?.[1] ?? null;
    const priceM = row.match(new RegExp(`id="groessePreis_${id}"[^>]*data-title="([^"]*)"[^>]*>\\s*([0-9'.,]+)\\s*<`));
    if (!priceM) continue;
    const price = Number(priceM[2]!.replace(/'/g, "").replace(",", "."));
    if (!Number.isFinite(price)) continue;
    const title = decode(priceM[1]!);
    const unit = title.match(/per\s+([^:]+):/)?.[1]?.trim() ?? null;
    const text = decode(row.match(/class="gt-text[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? name);
    const orig = decode(row.match(/data-title="Orig\. Nr\.[^"]*"><span>([^<]*)</)?.[1] ?? "") || null;
    out.push({
      ...base, productName: text || name, variantId: id, supplierArticleNumber: nr, manufacturerArticleNumber: orig,
      priceUnit: normUnit(unit), priceUnitQuantity: 1, publicGrossPrice: price,
      vatIncluded: /exkl/i.test(title) ? false : null, hasVariants: false, lastUpdated: now(),
    });
  }
  if (!out.length) {
    // Single-article page: one price span with itemprop="price".
    const one = html.match(/id="groessePreis_(\d+)"[^>]*itemprop="price"[^>]*content="([0-9.]+)"/);
    if (one) {
      const before = html.slice(Math.max(0, (one.index ?? 0) - 1500), one.index);
      const unitTitle = [...before.matchAll(/CHF(?:&nbsp;|\s)+(exkl|inkl)\.?(?:&nbsp;|\s)+MwSt(?:&nbsp;|\s)+per(?:&nbsp;|\s)+([^<]+)</g)].pop();
      const sku = html.match(/itemprop="sku">([^<]+)</)?.[1] ?? null;
      const price = Number(one[2]);
      if (Number.isFinite(price)) out.push({
        ...base, productName: name, variantId: one[1]!, supplierArticleNumber: sku ?? base.supplierArticleNumber,
        priceUnit: normUnit(unitTitle?.[2]?.trim()), priceUnitQuantity: 1, publicGrossPrice: price,
        vatIncluded: unitTitle ? unitTitle[1] === "inkl" : null, hasVariants: false, lastUpdated: now(),
      });
    }
  }
  return out;
}

/* ---------- Pestalozzi ---------- */
export function mapPestalozzi(list: R[]): CatalogHit[] {
  return list.map((p): CatalogHit => {
    const pe = Number(p.lngSalesPriceUnit);
    const img = typeof p.sImage === "string" && !/Dummy/i.test(p.sImage) ? `https://shop.pestalozzi.com/haustechnik/${p.sImage}` : null;
    return {
      supplierId: "pestalozzi", productId: String(p.sArticleID ?? ""), variantId: null,
      supplierArticleNumber: p.sUniformNumber ?? p.sArticleID ?? null, manufacturer: null, manufacturerArticleNumber: null,
      productName: [p.sGroupName, p.sArticleName].filter(Boolean).map(String).map((s) => s.trim()).join(" – ") || String(p.sArticleID),
      description: p.sArticleDesc?.trim() ?? null, imageUrl: img,
      detailUrl: p.sArticleID ? `https://shop.pestalozzi.com/haustechnik/ProductContentPageServlet?action=show&key=ARTIKEL&value=${encodeURIComponent(p.sArticleID)}` : null,
      priceUnit: normUnit(p.sQuantityUnitSales), priceUnitQuantity: pe > 0 ? pe : 1, currency: "CHF",
      publicGrossPrice: typeof p.decPriceBrutto === "number" ? p.decPriceBrutto : null, customerNetPrice: null,
      vatIncluded: null, // not confirmed
      availabilityStatus: null, // "locked-available" is not a verified stock
      stockQuantity: null, hasVariants: false, lastUpdated: now(), source: "public",
    };
  }).filter((h) => h.productId);
}

/**
 * Incremental scanner for a top-level JSON array: returns complete objects seen so far.
 * Lets us stop a 35 MB response after the first N items.
 */
export function createArrayScanner() {
  let depth = 0, inStr = false, esc = false, start = -1, buf = "", started = false;
  const items: unknown[] = [];
  return {
    items,
    push(chunk: string) {
      const offset = buf.length;
      buf += chunk;
      for (let i = offset; i < buf.length; i++) {
        const c = buf[i];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; continue; }
        if (!started) { if (c === "[") started = true; else if (!/\s/.test(c!)) throw new Error("Keine JSON-Liste"); continue; }
        if (c === "{") { if (depth === 0) start = i; depth++; }
        else if (c === "}") { depth--; if (depth === 0 && start >= 0) { items.push(JSON.parse(buf.slice(start, i + 1))); start = -1; } }
      }
      if (depth === 0) { buf = ""; } else if (start > 0) { buf = buf.slice(start); start = 0; }
    },
  };
}
