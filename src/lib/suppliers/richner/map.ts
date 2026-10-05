import type { PriceRow } from "../types";

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function pick(obj: Json | null, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function nested(obj: Json | null, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[p];
  }
  return cur;
}

export function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function wrapList(json: unknown): Json[] {
  if (Array.isArray(json)) return json.map(asRecord).filter((x): x is Json => !!x);
  const rec = asRecord(json);
  if (!rec) return [];
  for (const k of ["items", "products", "prices", "stocks", "data", "results", "atp"]) {
    const v = rec[k];
    if (Array.isArray(v)) return v.map(asRecord).filter((x): x is Json => !!x);
  }
  const values = Object.values(rec).map(asRecord).filter((x): x is Json => !!x);
  if (values.length > 1) return values;
  return [rec];
}

export function articleFrom(obj: Json | null, fallback: string) {
  return str(pick(obj, ["articleNumber", "articleNo", "article_number", "productId", "product_id", "id", "sku"])) ?? fallback;
}

export function mapProduct(raw: unknown, articleNumber: string, supplier: string, baseUrl: string) {
  const root = asRecord(raw);
  const product = asRecord(nested(root, ["product"])) ?? asRecord(nested(root, ["data"])) ?? root ?? {};
  const images = product["images"] ?? product["image"];
  let imageUrl: string | null = null;
  if (typeof images === "string") imageUrl = images;
  else if (Array.isArray(images) && images[0]) {
    const first = images[0];
    imageUrl = typeof first === "string" ? first : str(pick(asRecord(first), ["url", "src", "href"]));
  }

  const name =
    str(pick(product, ["name", "title", "productName", "bezeichnung", "descriptionShort"])) ?? articleNumber;

  const pathUrl = str(pick(product, ["url", "productUrl", "href", "link"]));
  const productUrl = pathUrl ? (pathUrl.startsWith("http") ? pathUrl : `${baseUrl}${pathUrl.startsWith("/") ? "" : "/"}${pathUrl}`) : null;

  return {
    supplier,
    supplierArticleNumber: articleFrom(product, articleNumber),
    manufacturer: str(pick(product, ["manufacturer", "brand", "hersteller", "producer"])),
    manufacturerArticleNumber: str(pick(product, ["manufacturerArticleNumber", "manufacturerSku", "mpn", "herstellernummer", "ean"])),
    productName: name,
    description: str(pick(product, ["description", "longDescription", "beschreibung"])),
    category: str(pick(product, ["category", "categoryName", "kategorie"])),
    imageUrl,
    grossPrice: num(pick(product, ["grossPrice", "listPrice", "priceGross", "bruttopreis", "uvp"])) ?? num(nested(product, ["price", "gross"])),
    purchasePrice: num(pick(product, ["netPrice", "purchasePrice", "priceNet", "einkaufspreis", "yourPrice"])) ?? num(nested(product, ["price", "net"])),
    stock: num(pick(product, ["stock", "quantity", "availableQuantity", "bestand"])),
    availability: str(pick(product, ["availability", "availabilityText", "status", "verfuegbarkeit"])),
    deliveryDate: str(pick(product, ["deliveryDate", "availableFrom", "lieferdatum", "atpDate"])),
    productUrl,
    lastUpdated: new Date().toISOString(),
  };
}

export function mapPrice(raw: unknown, fallbackId: string) {
  const obj = asRecord(raw) ?? {};
  const netList = obj["netPrices"];
  const netFromList = Array.isArray(netList) && netList[0] != null
    ? num(pick(asRecord(netList[0]), ["price", "net", "netPrice"]))
    : null;
  return {
    supplierArticleNumber: articleFrom(obj, fallbackId),
    purchasePrice:
      netFromList ??
      num(pick(obj, ["net", "netPrice", "purchasePrice", "priceNet", "yourPrice"])) ??
      num(nested(obj, ["price", "net"])),
    grossPrice: num(pick(obj, ["gross", "grossPrice", "listPrice", "priceGross"])) ?? num(nested(obj, ["price", "gross"])),
  };
}

/** Handles keyed shop responses: { "01527299": [{ grossPrice, netPrices: [{ price }] }] } */
export function mapPricePayload(json: unknown): PriceRow[] {
  const rec = asRecord(json);
  if (rec) {
    const knownList = ["items", "products", "prices", "data", "results"].some((k) => Array.isArray(rec[k]));
    if (!knownList) {
      const entries = Object.entries(rec);
      const keyed = entries.filter(([, v]) => Array.isArray(v) || asRecord(v));
      if (keyed.length) {
        return keyed.map(([id, v]) => {
          const first = Array.isArray(v) ? v[0] : v;
          return mapPrice(first, id);
        });
      }
    }
  }
  return wrapList(json).map((r) => mapPrice(r, articleFrom(r, "")));
}

export function mapStock(raw: unknown, fallbackId: string) {
  const obj = asRecord(raw) ?? {};
  return {
    supplierArticleNumber: articleFrom(obj, fallbackId),
    stock: num(pick(obj, ["stock", "quantity", "availableQuantity", "bestand", "qty"])),
    availability: str(pick(obj, ["availability", "status", "verfuegbarkeit"])),
  };
}

export function mapAtp(raw: unknown, fallbackId: string) {
  const obj = asRecord(raw) ?? {};
  return {
    supplierArticleNumber: articleFrom(obj, fallbackId),
    deliveryDate: str(pick(obj, ["deliveryDate", "date", "availableFrom", "lieferdatum", "atpDate"])),
    availability: str(pick(obj, ["availability", "status", "verfuegbarkeit"])),
  };
}
