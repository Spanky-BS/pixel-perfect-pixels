/** Normalized product the frontend may display. Never includes cookies or raw shop session data. */
export type NormalizedSupplierProduct = {
  supplier: string;
  supplierArticleNumber: string;
  manufacturer: string | null;
  manufacturerArticleNumber: string | null;
  productName: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  grossPrice: number | null;
  purchasePrice: number | null;
  stock: number | null;
  availability: string | null;
  deliveryDate: string | null;
  productUrl: string | null;
  lastUpdated: string;
};

export type SupplierId = "richner";

export type PriceRow = Pick<NormalizedSupplierProduct, "supplierArticleNumber" | "purchasePrice" | "grossPrice">;
export type StockRow = Pick<NormalizedSupplierProduct, "supplierArticleNumber" | "stock" | "availability">;
export type AtpRow = Pick<NormalizedSupplierProduct, "supplierArticleNumber" | "deliveryDate" | "availability">;

export interface SupplierAdapter {
  id: SupplierId;
  getProduct(articleNumber: string): Promise<NormalizedSupplierProduct>;
  getPrices(ids: string[]): Promise<PriceRow[]>;
  getStocks(ids: string[]): Promise<StockRow[]>;
  getAtp(ids: string[]): Promise<AtpRow[]>;
}

export type LookupProductsResult = {
  products: NormalizedSupplierProduct[];
  errors: { articleNumber: string; message: string }[];
};

export type SupplierConnectionStatus = {
  supplier: SupplierId;
  connected: boolean;
};
