import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/app";
import type { NormalizedSupplierProduct } from "./types";

export async function ensureSupplierRow(name: string, preferred = false, priority = 0) {
  const uid = await requireUserId();
  const { data: existing, error: readError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("name", name)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ user_id: uid, name, preferred, priority, connection_status: "nicht verbunden" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function cacheSupplierProduct(product: NormalizedSupplierProduct, supplierId: string) {
  const uid = await requireUserId();
  const row = {
    user_id: uid,
    supplier_id: supplierId,
    supplier_article_no: product.supplierArticleNumber,
    manufacturer: product.manufacturer,
    manufacturer_article_no: product.manufacturerArticleNumber,
    name: product.productName,
    description: product.description,
    category: product.category,
    image_url: product.imageUrl,
    purchase_price: product.purchasePrice,
    gross_price: product.grossPrice,
    stock: product.stock,
    availability: product.availability,
    delivery_date: product.deliveryDate ? product.deliveryDate.slice(0, 10) : null,
    product_url: product.productUrl,
    last_updated: product.lastUpdated,
  };
  const { data: found } = await supabase
    .from("supplier_products")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("supplier_article_no", product.supplierArticleNumber)
    .maybeSingle();
  if (found) {
    const { data, error } = await supabase.from("supplier_products").update(row).eq("id", found.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("supplier_products").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function assignProductToMaterial(materialId: string, supplierProductId: string) {
  await supabase.from("selected_products").delete().eq("material_id", materialId);
  const { error } = await supabase.from("selected_products").insert({
    material_id: materialId,
    supplier_product_id: supplierProductId,
    is_preferred: true,
  });
  if (error) throw error;
  const { error: matErr } = await supabase
    .from("material_requirements")
    .update({ status: "Produkt ausgewählt" })
    .eq("id", materialId);
  if (matErr) throw matErr;
}
