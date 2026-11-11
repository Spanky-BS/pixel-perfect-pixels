import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CatalogHit, SupplierResult } from "./catalog";

const sup = z.enum(["richner", "engel", "pestalozzi", "sanitas"]);

export const searchSupplierCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80), suppliers: z.array(sup).min(1).max(4) }).parse(d))
  .handler(async ({ data }): Promise<SupplierResult[]> => {
    const { searchCatalog } = await import("./catalog.server");
    return searchCatalog(data.q, data.suppliers);
  });

export const loadEngelVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hit: z.object({ productId: z.string().regex(/^\d{1,12}$/) }).passthrough() }).parse(d))
  .handler(async ({ data }): Promise<{ variants: CatalogHit[]; error: string | null }> => {
    const { engelVariants } = await import("./catalog.server");
    try {
      return { variants: await engelVariants(data.hit.productId, data.hit as unknown as CatalogHit), error: null };
    } catch (e) {
      return { variants: [], error: e instanceof Error ? e.message : "Fehler" };
    }
  });
