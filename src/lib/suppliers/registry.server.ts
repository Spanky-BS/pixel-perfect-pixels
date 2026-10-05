import type { SupplierAdapter, SupplierId } from "./types";
import { richnerAdapterFromSession } from "./richner/adapter.server";
import { loadRichnerSession } from "./session.server";

export async function getSupplierAdapter(id: SupplierId, userId: string): Promise<SupplierAdapter> {
  if (id === "richner") {
    const session = await loadRichnerSession(userId);
    return richnerAdapterFromSession(session.baseUrl, session.cookieHeader);
  }
  throw new Error(`Unbekannter Lieferant: ${id}`);
}
