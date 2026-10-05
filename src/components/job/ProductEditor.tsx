import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/CustomerForm";
import { UNITS } from "@/lib/app";
import type { Product } from "@/lib/products";
import type { Category } from "@/lib/app";

export type ProductDraft = Partial<Product> & { name?: string };

export function ProductEditor({
  draft,
  categories,
  onClose,
  onSaved,
}: {
  draft: ProductDraft | null;
  categories: Category[] | undefined;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [d, setD] = useState<ProductDraft | null>(draft);
  const cur = d;
  const set = (k: keyof Product, v: unknown) => cur && setD({ ...cur, [k]: v });

  async function save() {
    if (!cur) return;
    if (!String(cur.name ?? "").trim()) return toast.error("Produktname fehlt");
    const { id, created_at, updated_at, user_id, ...rest } = cur;
    void created_at; void updated_at; void user_id;
    const payload = {
      ...rest,
      name: String(cur.name).trim(),
      unit: cur.unit || "Stk",
      source: cur.source ?? "manual",
    };
    const q = id
      ? supabase.from("products").update(payload).eq("id", id).select("*").single()
      : supabase.from("products").insert(payload).select("*").single();
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    toast.success("Produkt gespeichert");
    onSaved(data);
    onClose();
  }

  return (
    <Sheet open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader><SheetTitle>{cur?.id ? "Produkt bearbeiten" : "Neues Produkt"}</SheetTitle></SheetHeader>
        {cur && (
          <div className="space-y-3 p-4 pt-0">
            <Field label="Produktname"><Input autoFocus className="h-12 text-base" value={cur.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Kategorie">
              <select value={cur.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} className="h-12 w-full rounded-md border border-input bg-card px-3 text-base">
                <option value="">– wählen –</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Beschreibung"><Textarea className="min-h-16 text-base" value={cur.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hersteller"><Input className="h-12 text-base" value={cur.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} /></Field>
              <Field label="Hersteller-Art.-Nr."><Input className="h-12 text-base" value={cur.manufacturer_article_no ?? ""} onChange={(e) => set("manufacturer_article_no", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lieferant (optional)"><Input className="h-12 text-base" value={cur.supplier_name ?? ""} onChange={(e) => set("supplier_name", e.target.value)} /></Field>
              <Field label="Lieferanten-Art.-Nr."><Input className="h-12 text-base" value={cur.supplier_article_no ?? ""} onChange={(e) => set("supplier_article_no", e.target.value)} /></Field>
            </div>
            <Field label="Einheit">
              <select value={cur.unit ?? "Stk"} onChange={(e) => set("unit", e.target.value)} className="h-12 w-full rounded-md border border-input bg-card px-3 text-base">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Letzter EK CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" step="any" value={cur.purchase_price ?? ""} onChange={(e) => set("purchase_price", e.target.value === "" ? null : Number(e.target.value))} /></Field>
              <Field label="Verkaufspreis CHF"><Input className="h-12 text-base" type="number" inputMode="decimal" step="any" value={cur.sales_price ?? ""} onChange={(e) => set("sales_price", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            </div>
            <Field label="Zuschlag % (wenn kein VK)"><Input className="h-12 text-base" type="number" inputMode="decimal" step="any" value={cur.markup ?? ""} onChange={(e) => set("markup", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            <Field label="Notizen"><Textarea className="min-h-16 text-base" value={cur.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            <Button className="h-12 w-full font-semibold" onClick={save}>Speichern</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
