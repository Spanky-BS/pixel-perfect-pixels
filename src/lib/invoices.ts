import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import type { Product } from "@/lib/products";
import { matchInvoiceLine } from "@/lib/invoice-match";
import { effectiveUnitEk, invoiceNetCost, needsBaselineHistory, type InvoiceNetResult } from "@/lib/invoice-cost";

export type SupplierInvoice = Tables<"supplier_invoices">;
export type SupplierInvoiceItem = Tables<"supplier_invoice_items">;
export type { InvoiceNetResult };

export function extractionLabel(s: string) {
  if (s === "wird_gelesen") return "Wird gelesen";
  if (s === "ausgelesen") return "Ausgelesen";
  if (s === "fehlgeschlagen") return "Lesen fehlgeschlagen";
  if (s === "manuelle_pruefung") return "Manuell prüfen";
  return "Ausstehend";
}

export function reviewLabel(s: string) {
  if (s === "bestaetigt") return "Bestätigt";
  return "Zur Prüfung";
}

export { effectiveUnitEk, invoiceNetCost, findCostDuplicate, invoiceIdentity } from "@/lib/invoice-cost";

export async function fetchJobInvoices(jobId: string, includedOnly = false) {
  let q = supabase.from("supplier_invoices").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
  if (includedOnly) q = q.eq("included_in_costs", true);
  const { data, error } = await q;
  if (error) throw error;
  const ids = (data ?? []).map((d) => d.id);
  if (!ids.length) return (data ?? []).map((inv) => ({ ...inv, supplier_invoice_items: [] as SupplierInvoiceItem[] }));
  const { data: its, error: iErr } = await supabase.from("supplier_invoice_items").select("*").in("invoice_id", ids);
  if (iErr) throw iErr;
  const by = new Map<string, SupplierInvoiceItem[]>();
  (its ?? []).forEach((it) => {
    const arr = by.get(it.invoice_id) ?? [];
    arr.push(it);
    by.set(it.invoice_id, arr);
  });
  return (data ?? []).map((inv) => ({ ...inv, supplier_invoice_items: by.get(inv.id) ?? [] }));
}

/** @deprecated use invoiceNetCost — never treat unknown gross as net */
export function invoiceNet(inv: Pick<SupplierInvoice, "net_total" | "gross_total" | "vat_amount">, items: Pick<SupplierInvoiceItem, "net_total">[]) {
  const r = invoiceNetCost(inv, items);
  return r.complete ? r.net : 0;
}

export async function recordPriceHistory(row: {
  product_id: string;
  supplier_name: string | null;
  purchase_price: number;
  invoice_date: string | null;
  supplier_invoice_id: string | null;
}) {
  const { error } = await supabase.from("product_price_history").insert(row);
  if (error) throw error;
}

export async function ensureMasterPriceInHistory(product: Pick<Product, "id" | "purchase_price" | "supplier_name">) {
  const master = product.purchase_price != null ? Number(product.purchase_price) : null;
  if (master == null) return;
  const { data, error } = await supabase.from("product_price_history").select("purchase_price").eq("product_id", product.id);
  if (error) throw error;
  const existing = (data ?? []).map((r) => Number(r.purchase_price));
  if (!needsBaselineHistory(existing, master)) return;
  await recordPriceHistory({
    product_id: product.id,
    supplier_name: product.supplier_name,
    purchase_price: master,
    invoice_date: null,
    supplier_invoice_id: null,
  });
}

export async function recordObservedPurchasePrice(opts: {
  product: Pick<Product, "id" | "purchase_price" | "supplier_name">;
  purchase_price: number;
  supplier_name: string | null;
  invoice_date: string | null;
  supplier_invoice_id: string;
  updateMaster: boolean;
}) {
  if (opts.updateMaster) await ensureMasterPriceInHistory(opts.product);
  await recordPriceHistory({
    product_id: opts.product.id,
    supplier_name: opts.supplier_name,
    purchase_price: opts.purchase_price,
    invoice_date: opts.invoice_date,
    supplier_invoice_id: opts.supplier_invoice_id,
  });
  const patch: TablesUpdate<"products"> = { last_purchase_date: opts.invoice_date };
  if (opts.updateMaster) {
    patch.purchase_price = opts.purchase_price;
    if (opts.supplier_name) patch.supplier_name = opts.supplier_name;
  }
  const { error } = await supabase.from("products").update(patch).eq("id", opts.product.id);
  if (error) throw error;
}

export async function applyInvoiceMatches(invoice: SupplierInvoice, items: SupplierInvoiceItem[], products: Product[]) {
  const remaining: SupplierInvoiceItem[] = [];
  for (const item of items) {
    const ek = effectiveUnitEk(item);
    const m = matchInvoiceLine(
      {
        description: item.description,
        manufacturer: item.manufacturer,
        manufacturer_article_no: item.manufacturer_article_no,
        supplier_article_no: item.supplier_article_no,
        supplier_name: invoice.supplier_name,
        unit_price: ek,
      },
      products,
    );
    const patch: TablesUpdate<"supplier_invoice_items"> = {
      match_kind: m.kind,
      matched_product_id: m.product?.id ?? null,
    };
    const lowConfidence = item.confidence === "niedrig" || invoice.extraction_confidence === "niedrig";
    const missingArt = !item.manufacturer_article_no?.trim() && !item.supplier_article_no?.trim();
    if (m.kind === "exact_match" && m.product && ek != null && !lowConfidence && !missingArt) {
      patch.product_id = m.product.id;
      patch.review_status = "erledigt";
      await recordObservedPurchasePrice({
        product: m.product,
        purchase_price: ek,
        supplier_name: invoice.supplier_name,
        invoice_date: invoice.invoice_date,
        supplier_invoice_id: invoice.id,
        updateMaster: false,
      });
    }
    await supabase.from("supplier_invoice_items").update(patch).eq("id", item.id);
    if (patch.review_status !== "erledigt") remaining.push({ ...item, ...patch } as SupplierInvoiceItem);
  }
  return remaining;
}
