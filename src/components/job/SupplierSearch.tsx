import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ExternalLink, Loader2, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { formatCHF } from "@/lib/app";
import { CATALOG_SUPPLIERS, unitPrice, type CatalogHit, type CatalogSupplier, type SupplierResult } from "@/lib/suppliers/catalog";
import { supabase } from "@/integrations/supabase/client";
import { rankFavorites, withLivePrice, type Favorite, type PickedProduct } from "@/lib/suppliers/favorites";
import { loadEngelVariants, searchSupplierCatalog } from "@/lib/suppliers/catalog.functions";

const ACTIVE = CATALOG_SUPPLIERS.filter((s) => s.connected).map((s) => s.id);
const nameOf = (id: CatalogSupplier) => CATALOG_SUPPLIERS.find((s) => s.id === id)?.name ?? id;

/** Search the wholesalers' public catalogues and hand one priced article back. */
export function SupplierSearch({ open, onClose, onPick, title, initialQuery, footer }: { open: boolean; onClose: () => void; onPick: (h: CatalogHit) => Promise<void> | void; title?: string | undefined; initialQuery?: string | undefined; footer?: ReactNode }) {
  const search = useServerFn(searchSupplierCatalog);
  const [q, setQ] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState<CatalogSupplier | "all">("all");
  const [results, setResults] = useState<SupplierResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PickedProduct[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.from("products").select("name,description,manufacturer,manufacturer_article_no,supplier_article_no,unit,purchase_price,source,created_at")
      .like("source", "%-public").order("created_at", { ascending: false }).limit(1000)
      .then(({ data }) => setPicked((data ?? []) as PickedProduct[]));
  }, [open]);
  const favorites: Favorite[] = q.trim().length >= 2 ? rankFavorites(picked, q).filter((f) => filter === "all" || f.hit.supplierId === filter) : [];

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await search({ data: { q: term, suppliers: ACTIVE } });
        if (live) { setResults(r); setPage(1); }
      } catch { if (live) setResults([]); }
      finally { if (live) setLoading(false); }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  /** Next page from every shop that still has more hits for the current filter. */
  const canMore = results.some((r) => r.partial && !r.error && (filter === "all" || r.supplierId === filter));
  async function loadMore() {
    const term = q.trim();
    const sups = results.filter((r) => r.partial && !r.error && (filter === "all" || r.supplierId === filter)).map((r) => r.supplierId);
    if (loadingMore || !sups.length || term.length < 2) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await search({ data: { q: term, suppliers: sups, page: next } });
      if (q.trim() !== term) return;
      setResults((prev) => prev.map((p) => {
        const n = r.find((x) => x.supplierId === p.supplierId);
        if (!n) return p;
        const seen = new Set(p.hits.map((h) => h.productId));
        const add = n.hits.filter((h) => !seen.has(h.productId));
        return { ...p, hits: [...p.hits, ...add], partial: n.partial && add.length > 0, error: n.error };
      }));
      setPage(next);
    } finally { setLoadingMore(false); }
  }
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canMore) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) void loadMore(); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  });

  async function pick(h: CatalogHit) {
    setBusy(true);
    try { await onPick(h); } finally { setBusy(false); }
  }
  const liveHits = results.flatMap((r) => r.hits);

  /** Favourite not in current live results: look it up by article number so today's price is used. */
  async function pickFavorite(f: Favorite) {
    const cur = withLivePrice(f, liveHits);
    if (cur.fresh || !f.hit.supplierArticleNumber) return pick(cur.hit);
    setBusy(true);
    try {
      const r = await search({ data: { q: f.hit.supplierArticleNumber, suppliers: [f.hit.supplierId] } });
      const again = withLivePrice(f, r.flatMap((x) => x.hits));
      if (!again.fresh && !confirm("Aktueller Shop-Preis nicht gefunden. Letzten bekannten Preis übernehmen?")) return;
      await onPick(again.hit);
    } catch {
      if (confirm("Shop nicht erreichbar. Letzten bekannten Preis übernehmen?")) await onPick(f.hit);
    } finally { setBusy(false); }
  }

  const shown = results.filter((r) => filter === "all" || r.supplierId === filter);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{title ?? "Produkt bei Lieferanten suchen"}</SheetTitle></SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="h-12 pl-9 text-base" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Handbrause, Duofix, Geberit PE …" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", ...ACTIVE] as const).map((id) => {
              const count = id === "all" ? results.reduce((s, r) => s + r.hits.length, 0) : results.find((r) => r.supplierId === id)?.hits.length ?? 0;
              return (
                <button key={id} onClick={() => setFilter(id)} className={`h-9 shrink-0 rounded-full border px-3 text-sm font-medium ${filter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                  {id === "all" ? "Alle" : nameOf(id)}{results.length ? ` · ${count}` : ""}
                </button>
              );
            })}
            <span className="flex h-9 shrink-0 items-center rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground">Sanitas Troesch: noch nicht verbunden</span>
          </div>
          {favorites.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Häufig verwendet</h3>
              {favorites.map((f) => {
                const cur = withLivePrice(f, liveHits);
                return (
                  <div key={f.hit.productId} className="relative">
                    <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">{f.uses}× verwendet</span>
                    <HitRow hit={cur.hit} busy={busy} onPick={() => pickFavorite(f)} />
                    <p className="px-3 pb-1 text-[11px] text-muted-foreground">
                      {cur.fresh ? "Preis tagesaktuell aus dem Shop" : loading ? "Aktueller Preis wird geprüft …" : `Letzter Preis vom ${new Date(f.lastUsed).toLocaleDateString("de-CH")} – wird beim Übernehmen im Shop aktualisiert`}
                    </p>
                  </div>
                );
              })}
              <h3 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live-Kataloge</h3>
            </div>
          )}
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lieferanten werden abgefragt …</p>}
          {!loading && q.trim().length >= 2 && results.length > 0 && shown.every((r) => !r.hits.length) && (
            <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">Keine Treffer. Anderen Begriff versuchen (z.B. Hersteller oder Art.-Nr.).</p>
          )}
          {shown.map((r) => (
            <div key={r.supplierId} className="space-y-2">
              {(r.error || r.partial) && (
                <p className="px-1 text-xs text-muted-foreground">
                  {nameOf(r.supplierId)}: {r.error ?? `${r.hits.length}${r.total ? ` von ${r.total}` : ""} Treffer geladen`}
                </p>
              )}
              {r.hits.map((h) => (h.hasVariants ? <EngelItem key={h.productId} hit={h} busy={busy} onPick={pick} /> : <HitRow key={h.productId} hit={h} busy={busy} onPick={pick} />))}
            </div>
          ))}
          {!loading && canMore && (
            <div ref={sentinel}>
              <button onClick={() => void loadMore()} disabled={loadingMore} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium">
                {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Weitere Treffer werden geladen …</> : "Mehr laden"}
              </button>
            </div>
          )}
          <p className="px-1 text-xs text-muted-foreground">Öffentliche Shop-Preise (keine persönlichen Nettopreise). Der Preis wird beim Übernehmen in der Offerte fixiert.</p>
          {footer}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function priceLabel(h: CatalogHit) {
  const up = unitPrice(h);
  if (up == null) return <span className="text-xs text-muted-foreground">Preis auf Anfrage</span>;
  return (
    <span className="text-right">
      <span className="block text-[15px] font-semibold tabular">{formatCHF(up)}</span>
      <span className="block text-[11px] text-muted-foreground">
        pro {h.priceUnit ?? "Einheit"}{h.priceUnitQuantity > 1 ? ` (Preis je ${h.priceUnitQuantity})` : ""}{h.vatIncluded === false ? " · exkl. MwSt" : ""}
      </span>
    </span>
  );
}

function Thumb({ src }: { src: string | null }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />;
  return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="h-12 w-12 shrink-0 rounded-md bg-muted object-contain" />;
}

function HitRow({ hit, busy, onPick, compact }: { hit: CatalogHit; busy: boolean; onPick: (h: CatalogHit) => void; compact?: boolean }) {
  const up = unitPrice(hit);
  return (
    <div className={compact ? "px-3 py-2" : "rounded-xl border bg-card p-3"}>
      <div className="flex gap-3">
        {!compact && <Thumb src={hit.imageUrl} />}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium">{hit.productName}</div>
          <div className="text-xs text-muted-foreground">
            {[nameOf(hit.supplierId), hit.manufacturer, hit.supplierArticleNumber && `Art. ${hit.supplierArticleNumber}`, hit.stockQuantity != null && `Lager ${hit.stockQuantity}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {hit.detailUrl && !compact ? <a href={hit.detailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">Im Shop <ExternalLink className="h-3 w-3" /></a> : <span />}
        <div className="flex items-center gap-3">
          {priceLabel(hit)}
          <button disabled={busy || up == null} onClick={() => onPick(hit)} className="h-10 shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">Übernehmen</button>
        </div>
      </div>
    </div>
  );
}

function EngelItem({ hit, busy, onPick }: { hit: CatalogHit; busy: boolean; onPick: (h: CatalogHit) => void }) {
  const load = useServerFn(loadEngelVariants);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ loading: boolean; variants: CatalogHit[] | null; error: string | null }>({ loading: false, variants: null, error: null });
  async function toggle() {
    setOpen(!open);
    if (state.variants || state.loading) return;
    setState({ loading: true, variants: null, error: null });
    const r = await load({ data: { hit } }).catch(() => ({ variants: [], error: "Fehler" }));
    setState({ loading: false, variants: r.variants, error: r.error });
  }
  return (
    <div className="rounded-xl border bg-card">
      <button onClick={toggle} className="flex w-full items-center gap-3 p-3 text-left">
        <Thumb src={hit.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium">{hit.productName}</div>
          <div className="truncate text-xs text-muted-foreground">ENGEL · {hit.supplierArticleNumber} · Grössen/Varianten wählen</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-border border-t">
          {state.loading && <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Varianten laden …</p>}
          {state.error && <p className="p-3 text-sm text-destructive">Varianten nicht lesbar ({state.error}).</p>}
          {state.variants?.length === 0 && !state.error && <p className="p-3 text-sm text-muted-foreground">Keine Varianten mit Preis gefunden.</p>}
          {state.variants?.map((v) => <HitRow key={v.variantId} hit={v} busy={busy} onPick={onPick} compact />)}
          {hit.detailUrl && <a href={hit.detailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 p-3 text-xs text-primary">Im ENGEL-Shop öffnen <ExternalLink className="h-3 w-3" /></a>}
        </div>
      )}
    </div>
  );
}
