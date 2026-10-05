export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function sameMoney(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

/** Effective net unit EK: line net / qty, else list unit_price. */
export function effectiveUnitEk(item: {
  quantity?: number | null;
  net_total?: number | null;
  unit_price?: number | null;
}): number | null {
  const qty = item.quantity != null ? Number(item.quantity) : NaN;
  const net = item.net_total != null ? Number(item.net_total) : null;
  if (net != null && Number.isFinite(net) && Number.isFinite(qty) && qty > 0) return roundMoney(net / qty);
  const unit = item.unit_price != null ? Number(item.unit_price) : null;
  if (unit != null && Number.isFinite(unit)) return roundMoney(unit);
  return null;
}

export function invoiceIdentity(supplier: string | null | undefined, invoiceNumber: string | null | undefined): string | null {
  const s = (supplier ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const n = (invoiceNumber ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || !n) return null;
  return `${s}|${n}`;
}

export function findCostDuplicate<T extends { id: string; supplier_name: string | null; invoice_number: string | null }>(
  invoices: T[],
  supplier: string | null | undefined,
  invoiceNumber: string | null | undefined,
  excludeId?: string,
): T | null {
  const key = invoiceIdentity(supplier, invoiceNumber);
  if (!key) return null;
  return invoices.find((inv) => inv.id !== excludeId && invoiceIdentity(inv.supplier_name, inv.invoice_number) === key) ?? null;
}

export type InvoiceNetResult =
  | { complete: true; net: number }
  | { complete: false; net: null; reason: string };

export function invoiceNetCost(
  inv: { net_total?: number | null; gross_total?: number | null; vat_amount?: number | null },
  items: { net_total?: number | null }[],
): InvoiceNetResult {
  if (inv.net_total != null && Number.isFinite(Number(inv.net_total))) {
    return { complete: true, net: Number(inv.net_total) };
  }
  if (items.length) {
    const nets = items.map((it) => (it.net_total != null ? Number(it.net_total) : null));
    if (nets.every((n): n is number => n != null && Number.isFinite(n))) {
      return { complete: true, net: nets.reduce((s, n) => s + n, 0) };
    }
  }
  if (inv.gross_total != null && inv.vat_amount != null && Number.isFinite(Number(inv.gross_total)) && Number.isFinite(Number(inv.vat_amount))) {
    return { complete: true, net: Number(inv.gross_total) - Number(inv.vat_amount) };
  }
  return { complete: false, net: null, reason: "Nettobetrag unklar – Brutto wird nicht als Materialkosten verwendet." };
}

export function needsBaselineHistory(existingPrices: number[], masterPrice: number | null): boolean {
  if (masterPrice == null || !Number.isFinite(masterPrice)) return false;
  return !existingPrices.some((p) => sameMoney(p, masterPrice));
}
