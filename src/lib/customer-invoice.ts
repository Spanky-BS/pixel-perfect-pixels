import { calculateQRReferenceChecksum, isIBANValid, isQRIBAN } from "swissqrbill/utils";
import type { Data as QrBillData } from "swissqrbill/types";
import { COMPANY } from "@/lib/company";
import { unitSalesPrice, type Product } from "@/lib/products";
import { rubricOf } from "@/lib/rubrics";

/** One invoice row. Lines are stored as a snapshot on the invoice so the PDF never changes afterwards. */
export type InvoiceLine = { kind: "arbeit" | "material" | "akonto"; rubric?: string; description: string; qty: number; unit: string; price: number; amount: number };

export const round2 = (n: number) => Math.round(n * 100) / 100;
/** Swiss cash rounding to 5 Rappen. */
export const round5 = (n: number) => Math.round(n * 20) / 20;

type LabourIn = { id: string; description: string; rubric?: string | null; hourly_rate: number | string | null };
type TimeIn = { labour_item_id: string; hours: number | string };
type MaterialIn = { description: string; rubric?: string | null; unit: string; quantity: number | string; actual_quantity?: number | string | null; products?: Product | Product[] | null };

/** Project invoice = effective effort: booked hours from Ausführung and used material (Ist-Menge, else Offerte-Menge). */
export function invoiceLinesFromActuals(input: {
  labour: LabourIn[];
  times: TimeIn[];
  materials: MaterialIn[];
  defaultRate: number;
  markup: number;
}) {
  const lines: InvoiceLine[] = [];
  let hours = 0;
  for (const l of input.labour) {
    const h = input.times.filter((t) => t.labour_item_id === l.id).reduce((s, t) => s + Number(t.hours), 0);
    if (h <= 0) continue;
    const rate = Number(l.hourly_rate) || input.defaultRate;
    hours += h;
    lines.push({ kind: "arbeit", rubric: rubricOf(l), description: l.description || "Arbeit", qty: round2(h), unit: "h", price: rate, amount: round2(h * rate) });
  }
  let unpriced = 0;
  for (const m of input.materials) {
    const qty = m.actual_quantity != null ? Number(m.actual_quantity) : Number(m.quantity);
    if (!(qty > 0)) continue;
    const raw = m.products;
    const p = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    const vk = p ? unitSalesPrice(p, input.markup) : null;
    if (vk == null) { unpriced += 1; continue; }
    lines.push({ kind: "material", rubric: rubricOf(m), description: p?.name || m.description || "Material", qty, unit: m.unit || "Stk", price: round2(vk), amount: round2(vk * qty) });
  }
  return { lines, hours: round2(hours), unpriced };
}

/** Net → VAT → total (5 Rappen) → minus already invoiced Akonto (incl. VAT) → amount due. */
export function invoiceTotals(net: number, vatRate: number, akontoDeducted = 0) {
  const n = round2(net);
  const vat = round2((n * vatRate) / 100);
  const total = round5(n + vat);
  const amountDue = round5(Math.max(0, total - akontoDeducted));
  return { net: n, vat, total, akontoDeducted: round2(akontoDeducted), amountDue };
}

export function sumLines(lines: InvoiceLine[]) {
  return round2(lines.reduce((s, l) => s + l.amount, 0));
}

/** RE-2026-001, counting up within the year across all of the user's invoices. */
export function nextInvoiceNumber(existing: string[], year: number) {
  const prefix = `RE-${year}-`;
  const max = existing.filter((n) => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** ISO date (YYYY-MM-DD) plus n days, timezone-safe. */
export function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatISODate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function normalizeIBAN(iban: string | null | undefined) {
  return (iban ?? "").replace(/\s+/g, "").toUpperCase();
}

export function ibanStatus(iban: string | null | undefined): "missing" | "invalid" | "ok" {
  const v = normalizeIBAN(iban);
  if (!v) return "missing";
  return isIBANValid(v) && (v.startsWith("CH") || v.startsWith("LI")) ? "ok" : "invalid";
}

/** 27-digit QR reference from the invoice number digits (only needed with a QR-IBAN). */
export function qrReferenceFor(number: string) {
  const base = number.replace(/\D/g, "").padStart(26, "0").slice(-26);
  return base + calculateQRReferenceChecksum(base);
}

function splitZipCity(s: string) {
  const m = s.trim().match(/^(\d{4,5})\s+(.+)$/);
  return m ? { zip: m[1]!, city: m[2]! } : { zip: "", city: s.trim() };
}

export function qrBillData(input: {
  iban: string;
  companyName: string;
  amount: number;
  number: string;
  debtor?: { name: string; street?: string | null | undefined; zip?: string | null | undefined; city?: string | null | undefined } | null | undefined;
}): QrBillData {
  const account = normalizeIBAN(input.iban);
  const { zip, city } = splitZipCity(COMPANY.zipCity);
  const d = input.debtor;
  const data: QrBillData = {
    currency: "CHF",
    amount: round2(input.amount),
    creditor: { account, name: input.companyName.slice(0, 70), address: COMPANY.street, zip, city, country: "CH" },
    message: `Rechnung ${input.number}`,
  };
  if (d?.name && d.street?.trim() && d.zip?.trim() && d.city?.trim()) {
    data.debtor = { name: d.name.slice(0, 70), address: d.street.trim().slice(0, 70), zip: d.zip.trim(), city: d.city.trim().slice(0, 35), country: "CH" };
  }
  if (isQRIBAN(account)) data.reference = qrReferenceFor(input.number);
  return data;
}

export const INVOICE_KIND_LABEL = { akonto: "Akontorechnung", schluss: "Schlussrechnung" } as const;
