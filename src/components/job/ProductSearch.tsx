import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignLibraryProduct, matchesProduct, type Product, type ProductSearchHit } from "@/lib/products";
import { categoriesQuery, productsQuery } from "@/lib/queries";
import { formatCHF } from "@/lib/app";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductEditor, type ProductDraft } from "./ProductEditor";

/**
 * Manual product picker. Live supplier hits can later be merged into the same list
 * via ProductSearchHit.source === "live" without changing this workflow.
 */
export function ProductSearch({
  materialId,
  jobId,
  hint,
  open,
  onClose,
}: {
  materialId: string;
  jobId: string;
  hint?: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cats = useQuery(categoriesQuery());
  const products = useQuery(productsQuery());
  const [q, setQ] = useState(hint ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? "";
  const hits: ProductSearchHit[] = useMemo(() => {
    const rows = products.data ?? [];
    const library = rows.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false;
      return matchesProduct(p, q, catName(p.category_id));
    });
    // Live supplier hits can be concatenated here later (source: "live").
    return library.map((product) => ({ source: "library" as const, product }));
  }, [products.data, q, categoryId, cats.data]);

  async function pick(p: Product) {
    setBusy(true);
    try {
      await assignLibraryProduct(materialId, p);
      toast.success("Produkt zugeordnet");
      qc.invalidateQueries({ queryKey: ["materials", jobId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zuordnen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Produkt auswählen</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-4 pt-0">
            <Input
              className="h-12 text-base"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, Hersteller, Art.-Nr. …"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
            >
              <option value="">Alle Kategorien</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button className="h-12 w-full font-semibold" onClick={() => setDraft({ name: q, category_id: categoryId || null, unit: "Stk" })}>
              + Neues Produkt
            </Button>
            {products.isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
            {!products.isLoading && !hits.length && (
              <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
                Keine Produkte. Legen Sie ein Produkt manuell an – ohne Lieferantenanbindung.
              </p>
            )}
            {hits.map((hit) => {
              if (hit.source !== "library") return null;
              const p = hit.product;
              return (
              <button key={p.id} disabled={busy} onClick={() => pick(p)} className="w-full rounded-xl border bg-card p-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-primary"
                    onClick={(e) => { e.stopPropagation(); setDraft(p); }}
                  >
                    Bearbeiten
                  </button>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[catName(p.category_id), p.manufacturer, p.manufacturer_article_no, p.supplier_name, p.supplier_article_no].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-1 font-mono text-sm">
                  EK {p.purchase_price != null ? formatCHF(Number(p.purchase_price)) : "–"} · VK{" "}
                  {p.sales_price != null ? formatCHF(Number(p.sales_price)) : p.markup != null ? `Zuschlag ${p.markup}%` : "–"}
                </div>
              </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
      <ProductEditor
        key={draft ? (draft.id ?? "new") : "none"}
        draft={draft}
        categories={cats.data}
        onClose={() => setDraft(null)}
        onSaved={(p) => {
          qc.invalidateQueries({ queryKey: ["products"] });
          pick(p);
        }}
      />
    </>
  );
}
