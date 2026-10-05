import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LookupProductsResult, NormalizedSupplierProduct } from "./types";

const supplierId = z.enum(["richner"]);

export const getSupplierConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ supplier: supplierId }).parse(d))
  .handler(async ({ data, context }) => {
    const { hasRichnerSession } = await import("./session.server");
    const connected = data.supplier === "richner" ? await hasRichnerSession(context.userId) : false;
    return { supplier: data.supplier, connected };
  });

export const lookupSupplierProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        supplier: supplierId,
        articleNumbers: z.array(z.string().min(1).max(64)).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<LookupProductsResult> => {
    const { getSupplierAdapter } = await import("./registry.server");
    const adapter = await getSupplierAdapter(data.supplier, context.userId);
    const products: NormalizedSupplierProduct[] = [];
    const errors: LookupProductsResult["errors"] = [];
    const ids = [...new Set(data.articleNumbers.map((n) => n.trim()).filter(Boolean))];
    for (const articleNumber of ids) {
      try {
        products.push(await adapter.getProduct(articleNumber));
      } catch (e) {
        errors.push({
          articleNumber,
          message: e instanceof Error ? e.message : "Artikel nicht gefunden",
        });
      }
    }
    return { products, errors };
  });
