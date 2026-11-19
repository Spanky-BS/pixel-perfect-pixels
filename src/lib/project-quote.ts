import { isQuotedLabour, type Labour, type Material } from "@/lib/app";
import { discountPercent, discountedAmount } from "@/lib/discount";
import { unitSalesPrice, type Product } from "@/lib/products";

export function linkedProduct(row: { products?: Product | Product[] | null }): Product | null {
  const p = row.products;
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

export function labourQuoteAmount(l: Pick<Labour, "hours" | "hourly_rate">) {
  return Number(l.hours) * Number(l.hourly_rate);
}

export function quotedLabour(list: Labour[] | null | undefined) {
  return (list ?? []).filter(isQuotedLabour);
}

export function extraLabour(list: Labour[] | null | undefined) {
  return (list ?? []).filter((l) => !isQuotedLabour(l));
}

export type QuoteTotals = {
  hours: number;
  labourTotal: number;
  materialTotal: number;
  unpriced: number;
  subtotalBeforeDiscount: number;
  discountTotal: number;
  subtotal: number;
  vat: number;
  total: number;
  incomplete: boolean;
};

export function computeQuote(
  labour: Labour[] | null | undefined,
  materials: Array<Material & { products?: Product | Product[] | null }> | null | undefined,
  vatRate: number,
  fallbackMarkup: number,
  offerDiscount = 0,
): QuoteTotals {
  const lab = quotedLabour(labour);
  const hours = lab.reduce((s, l) => s + Number(l.hours), 0);
  const labourTotal = lab.reduce((s, l) => s + labourQuoteAmount(l), 0);
  let materialTotal = 0;
  let unpriced = 0;
  (materials ?? []).forEach((m) => {
    const p = linkedProduct(m);
    const qty = Number(m.quantity);
    const vk = p ? unitSalesPrice(p, fallbackMarkup) : null;
    if (vk != null) materialTotal += vk * qty;
    else unpriced += 1;
  });
  const subtotalBeforeDiscount = labourTotal + materialTotal;
  const subtotal = discountedAmount(subtotalBeforeDiscount, offerDiscount);
  const discountTotal = subtotalBeforeDiscount - subtotal;
  const vat = Math.round(subtotal * vatRate) / 100;
  return {
    hours,
    labourTotal,
    materialTotal,
    unpriced,
    subtotalBeforeDiscount,
    discountTotal,
    subtotal,
    vat,
    total: subtotal + vat,
    incomplete: unpriced > 0,
  };
}

export function quoteDiscountPercent(job: { offer_discount_percent?: number | null }) {
  return discountPercent(job.offer_discount_percent);
}
