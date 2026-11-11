import {
  applyRichnerPrices, createArrayScanner, mapPestalozzi, mapRichnerProducts, parseEngelSearch, parseEngelVariants,
  type CatalogHit, type CatalogSupplier, type SupplierResult,
} from "./catalog";

const UA = "Mozilla/5.0 (compatible; HaustechnikNWS-App/1.0)";
const LIMIT = 30;

async function timed(url: string, init: RequestInit = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json, text/html", ...(init.headers ?? {}) } });
  } finally { clearTimeout(t); }
}

/** One retry for network/5xx errors only. */
async function getJson(url: string, init?: RequestInit, ms?: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await timed(url, init, ms);
      if (r.status >= 500 && attempt === 0) continue;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as unknown;
    } catch (e) {
      if (attempt === 0 && !(e instanceof Error && e.message.startsWith("HTTP"))) continue;
      throw e;
    }
  }
}

/* short in-memory cache for public results only (no customer prices) */
const cache = new Map<string, { at: number; v: SupplierResult }>();
const TTL: Record<CatalogSupplier, number> = { richner: 10 * 60e3, engel: 30 * 60e3, pestalozzi: 30 * 60e3, sanitas: 0 };

async function richner(q: string): Promise<SupplierResult> {
  const base = "https://baubedarf-richner.ch/api/v1";
  const { hits, total } = mapRichnerProducts(await getJson(`${base}/products?q=${encodeURIComponent(q)}&p=1`));
  const ids = hits.slice(0, LIMIT).map((h) => `ids=${encodeURIComponent(h.productId)}`).join("&");
  const [prices, stocks] = ids
    ? await Promise.all([getJson(`${base}/products/prices?${ids}`).catch(() => ({})), getJson(`${base}/products/stocks?${ids}`).catch(() => ({}))])
    : [{}, {}];
  return { supplierId: "richner", hits: applyRichnerPrices(hits.slice(0, LIMIT), prices, stocks), total, partial: (total ?? 0) > LIMIT, error: null };
}

async function engel(q: string): Promise<SupplierResult> {
  const json = await getJson("https://shop.engel.ch/pagesshop/rpc/rpc_search.cfm", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `q=${encodeURIComponent(q)}&srv=search`,
  });
  const { hits, total } = parseEngelSearch(json);
  return { supplierId: "engel", hits: hits.slice(0, LIMIT), total, partial: (total ?? 0) > hits.length || hits.length > LIMIT, error: null };
}

export async function engelVariants(artid: string, base: CatalogHit) {
  const r = await timed(`https://shop.engel.ch/?srv=sortiment&pg=det&artid=${encodeURIComponent(artid)}`, {}, 10000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const v = parseEngelVariants(html, base);
  if (!v.length && /groessePreis_/.test(html)) throw new Error("ENGEL-Preise nicht eindeutig lesbar");
  return v;
}

let pestSession: { cookie: string; at: number } | null = null;
async function pestalozziCookie() {
  if (pestSession && Date.now() - pestSession.at < 10 * 60e3) return pestSession.cookie;
  const jar = new Map<string, string>();
  let url = "https://shop.pestalozzi.com/haustechnik/";
  for (let i = 0; i < 4; i++) {
    const r = await timed(url, { redirect: "manual", headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    const sc = (r.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of sc) { const [kv] = c.split(";"); const j = kv!.indexOf("="); if (j > 0) jar.set(kv!.slice(0, j).trim(), kv!.slice(j + 1).trim()); }
    await r.body?.cancel();
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) url = new URL(loc, url).toString(); else break;
  }
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  pestSession = { cookie, at: Date.now() };
  return cookie;
}

async function pestalozzi(q: string): Promise<SupplierResult> {
  const cookie = await pestalozziCookie();
  const r = await timed(`https://shop.pestalozzi.com/haustechnik/api/productall?key=SEARCH&value=${encodeURIComponent(q)}`, { headers: { Cookie: cookie } }, 12000);
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const scan = createArrayScanner();
  let bytes = 0, partial = false, done = false;
  const started = Date.now();
  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) { done = true; break; }
    bytes += value.byteLength;
    scan.push(dec.decode(value, { stream: true }));
    if (scan.items.length >= LIMIT || bytes > 6_000_000 || Date.now() - started > 9000) { partial = true; break; }
  }
  if (partial) await reader.cancel().catch(() => {});
  if (pestSession && !scan.items.length && !done) pestSession = null;
  const hits = mapPestalozzi(scan.items.slice(0, LIMIT) as object[]);
  return { supplierId: "pestalozzi", hits, total: partial ? null : hits.length, partial, error: null };
}

const RUN: Record<Exclude<CatalogSupplier, "sanitas">, (q: string) => Promise<SupplierResult>> = { richner, engel, pestalozzi };

export async function searchCatalog(q: string, suppliers: CatalogSupplier[]): Promise<SupplierResult[]> {
  return Promise.all(suppliers.map(async (s): Promise<SupplierResult> => {
    if (s === "sanitas") return { supplierId: s, hits: [], total: null, partial: false, error: "Noch nicht verbunden" };
    const key = `${s}:${q.toLowerCase()}`;
    const c = cache.get(key);
    if (c && Date.now() - c.at < TTL[s]) return c.v;
    try {
      const v = await RUN[s](q);
      cache.set(key, { at: Date.now(), v });
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      return v;
    } catch (e) {
      console.warn(JSON.stringify({ supplier: s, event: "search_failed", message: e instanceof Error ? e.message : "unknown" }));
      return { supplierId: s, hits: [], total: null, partial: false, error: "Shop nicht erreichbar" };
    }
  }));
}
