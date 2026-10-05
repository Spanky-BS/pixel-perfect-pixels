import type { NormalizedSupplierProduct, SupplierAdapter } from "../types";
import { createRichnerClient, fetchAtp, fetchPrices, fetchProductJson, fetchStocks, type RichnerClient } from "./client.server";
import { mapProduct } from "./map";

export function createRichnerAdapter(client: RichnerClient, baseUrl: string): SupplierAdapter {
  return {
    id: "richner",
    async getProduct(articleNumber: string): Promise<NormalizedSupplierProduct> {
      const json = await fetchProductJson(client, articleNumber);
      const product = mapProduct(json, articleNumber, "richner", baseUrl);
      const [prices, stocks, atp] = await Promise.all([
        fetchPrices(client, [product.supplierArticleNumber]).catch(() => []),
        fetchStocks(client, [product.supplierArticleNumber]).catch(() => []),
        fetchAtp(client, [product.supplierArticleNumber]).catch(() => []),
      ]);
      const p = prices[0];
      const s = stocks[0];
      const a = atp[0];
      return {
        ...product,
        purchasePrice: p?.purchasePrice ?? product.purchasePrice,
        grossPrice: p?.grossPrice ?? product.grossPrice,
        stock: s?.stock ?? product.stock,
        availability: s?.availability ?? a?.availability ?? product.availability,
        deliveryDate: a?.deliveryDate ?? product.deliveryDate,
        lastUpdated: new Date().toISOString(),
      };
    },
    getPrices(ids) {
      return fetchPrices(client, ids);
    },
    getStocks(ids) {
      return fetchStocks(client, ids);
    },
    getAtp(ids) {
      return fetchAtp(client, ids);
    },
  };
}

export function richnerAdapterFromSession(baseUrl: string, cookieHeader: string): SupplierAdapter {
  return createRichnerAdapter(createRichnerClient(baseUrl, cookieHeader), baseUrl);
}
