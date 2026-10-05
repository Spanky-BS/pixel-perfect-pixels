import type { AtpRow, PriceRow, StockRow } from "../types";
import { mapAtp, mapPricePayload, mapStock, wrapList } from "./map";
import { repeatQueryParams } from "./query";

export class RichnerHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RichnerHttpError";
  }
}

export type RichnerClient = {
  get: (path: string) => Promise<unknown>;
};

export function createRichnerClient(baseUrl: string, cookieHeader: string): RichnerClient {
  return {
    async get(path: string) {
      const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
        },
        redirect: "manual",
      });
      if (res.status === 401 || res.status === 403) {
        throw new RichnerHttpError("Richner-Anmeldung ungültig oder abgelaufen.", res.status);
      }
      if (res.status >= 300 && res.status < 400) {
        throw new RichnerHttpError("Richner-Anmeldung ungültig oder abgelaufen.", res.status);
      }
      if (!res.ok) {
        throw new RichnerHttpError(`Richner-Fehler (${res.status})`, res.status);
      }
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new RichnerHttpError("Richner lieferte keine JSON-Antwort.", res.status);
      }
    },
  };
}

export async function fetchProductJson(client: RichnerClient, articleNumber: string) {
  return client.get(`/api/v1/products/${encodeURIComponent(articleNumber)}`);
}

export async function fetchPrices(client: RichnerClient, ids: string[]): Promise<PriceRow[]> {
  if (!ids.length) return [];
  const json = await client.get(`/api/v1/products/prices?${repeatQueryParams("ids", ids)}`);
  return mapPricePayload(json);
}

export async function fetchStocks(client: RichnerClient, ids: string[]): Promise<StockRow[]> {
  if (!ids.length) return [];
  const json = await client.get(`/api/v1/products/stocks?${repeatQueryParams("ids", ids)}`);
  const rows = wrapList(json);
  return rows.map((r, i) => mapStock(r, ids[i] ?? ""));
}

/** ATP batch format is not confirmed; look up one product at a time. */
export async function fetchAtp(client: RichnerClient, ids: string[]): Promise<AtpRow[]> {
  const out: AtpRow[] = [];
  for (const id of ids) {
    const json = await client.get(`/api/v1/atp?productIds=${encodeURIComponent(id)}`);
    const rows = wrapList(json);
    out.push(mapAtp(rows[0] ?? json, id));
  }
  return out;
}
