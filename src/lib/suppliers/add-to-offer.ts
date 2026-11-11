import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/app";
import { CATALOG_SUPPLIERS, unitPrice, type CatalogHit } from "./catalog";

/**
 * Snapshot the supplier article as a library product (price fixed at pick time) and
 * add it as a material position in the given rubric. Later shop price changes never touch it.
 */
async function snapshotHit(hit: CatalogHit) {
  const uid = await requireUserId();
  const price = unitPrice(hit);
  if (price == null) throw new Error("Artikel hat keinen Preis");
  const supplier = CATALOG_SUPPLIERS.find((s) => s.id === hit.supplierId)?.name ?? hit.supplierId;
  const stamp = new Date().toLocaleString("de-CH");
  const { data: product, error } = await supabase.from("products").insert({
    user_id: uid,
    name: hit.productName,
    description: hit.description,
    manufacturer: hit.manufacturer,
    manufacturer_article_no: hit.manufacturerArticleNumber,
    supplier_name: supplier,
    supplier_article_no: hit.supplierArticleNumber,
    unit: hit.priceUnit ?? "Stk",
    purchase_price: price,
    source: `${hit.supplierId}-public`,
    last_purchase_date: new Date().toISOString().slice(0, 10),
    notes: `Öffentlicher Shop-Preis ${supplier}, übernommen ${stamp}${hit.vatIncluded === false ? ", exkl. MwSt" : hit.vatIncluded == null ? ", MwSt-Status unbestätigt" : ""}${hit.priceUnitQuantity > 1 ? `, Preisbasis ${hit.priceUnitQuantity}` : ""}${hit.detailUrl ? ` · ${hit.detailUrl}` : ""}`,
  }).select("*").single();
  if (error) throw error;
  return { uid, product };
}

/** Link a live supplier article to an existing (unpriced) material position. */
export async function assignCatalogHit(materialId: string, hit: CatalogHit) {
  const { product } = await snapshotHit(hit);
  const { error } = await supabase.from("material_requirements").update({
    product_id: product.id,
    status: "Produkt ausgewählt",
    unit: hit.priceUnit ?? "Stk",
    preferred_brand: hit.manufacturer,
    source: "lieferant",
  }).eq("id", materialId);
  if (error) throw error;
}

export async function addCatalogHitToOffer(jobId: string, rubric: string, hit: CatalogHit, sortOrder: number) {
  const { uid, product } = await snapshotHit(hit);
  const { error: mErr } = await supabase.from("material_requirements").insert({
    user_id: uid,
    job_id: jobId,
    description: hit.productName,
    quantity: 1,
    unit: hit.priceUnit ?? "Stk",
    status: "Produkt ausgewählt",
    rubric,
    product_id: product.id,
    preferred_brand: hit.manufacturer,
    source: "lieferant",
    sort_order: sortOrder,
  });
  if (mErr) throw mErr;
}
