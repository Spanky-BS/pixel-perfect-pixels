import type { Product } from "@/lib/products";

export type MatchKind = "exact_match" | "probable_match" | "new_product" | "price_change";

export type InvoiceLineMatchInput = {
  description: string;
  manufacturer: string | null;
  manufacturer_article_no: string | null;
  supplier_article_no: string | null;
  supplier_name: string | null;
  unit_price: number | null;
};

export type LineMatch = {
  kind: MatchKind;
  product: Product | null;
  reasons: string[];
  oldPrice: number | null;
  newPrice: number | null;
  changePct: number | null;
};

const PRICE_PCT = 1.5;
const PRICE_ABS = 0.5;

export function normArt(v: string | null | undefined) {
  return (v ?? "").replace(/[\s.\-/]/g, "").toLowerCase();
}

function normText(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

export function nameOverlap(a: string, b: string) {
  const tok = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9äöüéèà]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const ta = new Set(tok(a));
  const tb = new Set(tok(b));
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  ta.forEach((w) => {
    if (tb.has(w)) n += 1;
  });
  return n / Math.max(ta.size, tb.size);
}

export function priceChanged(oldPrice: number | null, newPrice: number | null) {
  if (oldPrice == null || newPrice == null) return false;
  const delta = Math.abs(newPrice - oldPrice);
  if (delta < PRICE_ABS) return false;
  if (oldPrice === 0) return delta >= PRICE_ABS;
  return (delta / oldPrice) * 100 >= PRICE_PCT;
}

export function changePct(oldPrice: number | null, newPrice: number | null) {
  if (oldPrice == null || newPrice == null || oldPrice === 0) return null;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10;
}

export function matchInvoiceLine(line: InvoiceLineMatchInput, products: Product[]): LineMatch {
  const mfrNo = normArt(line.manufacturer_article_no);
  const supNo = normArt(line.supplier_article_no);
  const supplier = normText(line.supplier_name);
  const mfr = normText(line.manufacturer);
  const desc = line.description.trim();

  const byMfrNo = mfrNo ? products.find((p) => normArt(p.manufacturer_article_no) === mfrNo) : undefined;
  if (byMfrNo) {
    const oldP = byMfrNo.purchase_price != null ? Number(byMfrNo.purchase_price) : null;
    const changed = priceChanged(oldP, line.unit_price);
    return {
      kind: changed ? "price_change" : "exact_match",
      product: byMfrNo,
      reasons: ["Hersteller-Art.-Nr. identisch"],
      oldPrice: oldP,
      newPrice: line.unit_price,
      changePct: changePct(oldP, line.unit_price),
    };
  }

  const bySup = supNo
    ? products.find((p) => normArt(p.supplier_article_no) === supNo && (!supplier || !p.supplier_name || normText(p.supplier_name) === supplier || normText(p.supplier_name).includes(supplier) || supplier.includes(normText(p.supplier_name))))
    : undefined;
  if (bySup) {
    const oldP = bySup.purchase_price != null ? Number(bySup.purchase_price) : null;
    const changed = priceChanged(oldP, line.unit_price);
    const reasons = ["Lieferanten-Art.-Nr. identisch"];
    if (supplier) reasons.push("gleicher Lieferant");
    return {
      kind: changed ? "price_change" : "exact_match",
      product: bySup,
      reasons,
      oldPrice: oldP,
      newPrice: line.unit_price,
      changePct: changePct(oldP, line.unit_price),
    };
  }

  let best: { p: Product; score: number; reasons: string[] } | null = null;
  for (const p of products) {
    const reasons: string[] = [];
    let score = 0;
    if (mfr && normText(p.manufacturer) === mfr) {
      reasons.push("gleicher Hersteller");
      score += 0.35;
    }
    if (supplier && p.supplier_name && (normText(p.supplier_name) === supplier || normText(p.supplier_name).includes(supplier))) {
      reasons.push("gleicher Lieferant");
      score += 0.15;
    }
    const overlap = nameOverlap(desc, [p.name, p.description].filter(Boolean).join(" "));
    if (overlap >= 0.45) {
      reasons.push("ähnliche Bezeichnung");
      score += overlap * 0.5;
    }
    const artSim =
      (mfrNo && p.manufacturer_article_no && (normArt(p.manufacturer_article_no).includes(mfrNo) || mfrNo.includes(normArt(p.manufacturer_article_no)))) ||
      (supNo && p.supplier_article_no && (normArt(p.supplier_article_no).includes(supNo) || supNo.includes(normArt(p.supplier_article_no))));
    if (artSim) {
      reasons.push("ähnliche Art.-Nr.");
      score += 0.2;
    }
    if (score > (best?.score ?? 0)) best = { p, score, reasons };
  }

  if (best && best.score >= 0.55 && best.reasons.length) {
    const oldP = best.p.purchase_price != null ? Number(best.p.purchase_price) : null;
    return {
      kind: "probable_match",
      product: best.p,
      reasons: best.reasons,
      oldPrice: oldP,
      newPrice: line.unit_price,
      changePct: changePct(oldP, line.unit_price),
    };
  }

  return { kind: "new_product", product: null, reasons: [], oldPrice: null, newPrice: line.unit_price, changePct: null };
}
