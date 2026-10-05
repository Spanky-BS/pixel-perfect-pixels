import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { NormalizedSupplierProduct } from "@/lib/suppliers/types";

export type Product = Tables<"products">;

/** Search hits. Live supplier results can be appended later without changing the picker UI. */
export type ProductSearchHit =
  | { source: "library"; product: Product }
  | { source: "live"; product: NormalizedSupplierProduct };

export function matchesProduct(
  p: Product,
  q: string,
  categoryName?: string | null,
) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [p.name, p.description, p.manufacturer, p.manufacturer_article_no, p.supplier_article_no, p.supplier_name, categoryName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(s);
}

export function unitSalesPrice(p: Pick<Product, "purchase_price" | "sales_price" | "markup">, fallbackMarkup = 0) {
  if (p.sales_price != null && Number.isFinite(Number(p.sales_price))) return Number(p.sales_price);
  const ek = p.purchase_price != null ? Number(p.purchase_price) : null;
  if (ek == null) return null;
  const m = p.markup != null && Number.isFinite(Number(p.markup)) ? Number(p.markup) : fallbackMarkup;
  return ek * (1 + m / 100);
}

export async function fetchProducts() {
  const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
  if (error) throw error;
  return data;
}

export async function searchLibrary(query: string, categoryId?: string | null): Promise<ProductSearchHit[]> {
  let q = supabase.from("products").select("*").eq("active", true).order("name");
  if (categoryId) q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).filter((p) => matchesProduct(p, query));
  return rows.map((product) => ({ source: "library" as const, product }));
}

export async function assignLibraryProduct(materialId: string, product: Product) {
  const patch: { product_id: string; status: string; unit?: string; preferred_brand?: string } = {
    product_id: product.id,
    status: "Produkt ausgewählt",
  };
  if (product.unit) patch.unit = product.unit;
  if (product.manufacturer) patch.preferred_brand = product.manufacturer;
  const { error } = await supabase.from("material_requirements").update(patch).eq("id", materialId);
  if (error) throw error;
}
