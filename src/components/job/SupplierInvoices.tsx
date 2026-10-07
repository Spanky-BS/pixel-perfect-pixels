import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, ImagePlus, FileText } from "lucide-react";
import { useImageSourceChooser } from "@/components/ImageSourceChooser";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/CustomerForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/Brand";
import { formatCHF, uploadMedia, signedUrls } from "@/lib/app";
import { extractSupplierInvoice } from "@/lib/invoice.functions";
import { applyInvoiceMatches, effectiveUnitEk, extractionLabel, fetchJobInvoices, findCostDuplicate, invoiceNetCost, recordObservedPurchasePrice, recordPriceHistory, reviewLabel, type SupplierInvoice, type SupplierInvoiceItem } from "@/lib/invoices";
import { matchInvoiceLine } from "@/lib/invoice-match";
import { productsQuery } from "@/lib/queries";
import type { Product } from "@/lib/products";

type Inv = SupplierInvoice & { supplier_invoice_items?: SupplierInvoiceItem[] };

export function SupplierInvoices({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const extract = useServerFn(extractSupplierInvoice);
  const products = useQuery(productsQuery());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Inv | null>(null);
  const [items, setItems] = useState<SupplierInvoiceItem[]>([]);
  const [queue, setQueue] = useState<SupplierInvoiceItem[] | null>(null);
  const [queueInv, setQueueInv] = useState<SupplierInvoice | null>(null);
  const [qi, setQi] = useState(0);

  const list = useQuery({
    queryKey: ["supplier-invoices", jobId],
    queryFn: () => fetchJobInvoices(jobId),
  });
  const costed = useQuery({
    queryKey: ["supplier-invoices-costed"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_invoices").select("id, job_id, supplier_name, invoice_number").eq("included_in_costs", true);
      if (error) throw error;
      return data;
    },
  });

  async function upload(files: FileList | File[] | null, kind: "photo" | "image" | "pdf") {
    if (!files?.length) return;
    setBusy(true);
    const t = toast.loading("Rechnung wird gespeichert…");
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || (kind === "pdf" ? "pdf" : "jpg")).toLowerCase();
        const path = await uploadMedia(jobId, file, ext);
        const { data, error } = await supabase.from("supplier_invoices").insert({
          job_id: jobId,
          storage_path: path,
          file_name: file.name || `Rechnung.${ext}`,
          file_type: kind === "pdf" || ext === "pdf" ? "pdf" : kind,
          extraction_status: "ausstehend",
        }).select("*").single();
        if (error || !data) throw error ?? new Error("Speichern fehlgeschlagen");
        toast.loading("Rechnung wird gelesen…", { id: t });
        const r = await extract({ data: { invoiceId: data.id } });
        if (r && typeof r === "object" && "manual" in r && r.manual) {
          toast.warning("PDF gespeichert – bitte Angaben manuell prüfen.", { id: t });
        } else {
          toast.success("Rechnung erfasst – bitte prüfen", { id: t });
        }
      }
      qc.invalidateQueries({ queryKey: ["supplier-invoices", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  const source = useImageSourceChooser({
    multipleImages: true,
    fileAccept: "application/pdf,.pdf",
    onImage: (files, src) => { void upload(files, src === "camera" ? "photo" : "image"); },
    onFile: (files) => { void upload(files, "pdf"); },
  });

  async function openInv(inv: Inv) {
    const urls = await signedUrls([inv.storage_path]);
    setOpen({ ...inv, url: urls[inv.storage_path] } as Inv & { url?: string });
    setItems([...(inv.supplier_invoice_items ?? [])].sort((a, b) => a.sort_order - b.sort_order));
  }

  async function saveDraft(silent = false) {
    if (!open) return false;
    const { error } = await supabase.from("supplier_invoices").update({
      supplier_name: open.supplier_name,
      invoice_number: open.invoice_number,
      invoice_date: open.invoice_date,
      currency: open.currency || "CHF",
      net_total: open.net_total,
      vat_amount: open.vat_amount,
      gross_total: open.gross_total,
    }).eq("id", open.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    for (const it of items) {
      const { error: iErr } = await supabase.from("supplier_invoice_items").update({
        description: it.description,
        manufacturer: it.manufacturer,
        manufacturer_article_no: it.manufacturer_article_no,
        supplier_article_no: it.supplier_article_no,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        discount: it.discount,
        net_total: it.net_total,
      }).eq("id", it.id);
      if (iErr) {
        toast.error(iErr.message);
        return false;
      }
    }
    if (!silent) toast.success("Angaben gespeichert");
    qc.invalidateQueries({ queryKey: ["supplier-invoices", jobId] });
    return true;
  }

  async function confirmInvoice() {
    if (!open) return;
    if (open.review_status === "bestaetigt" || open.included_in_costs) return toast.message("Bereits bestätigt");
    const ok = await saveDraft(true);
    if (!ok) return;
    const dup = findCostDuplicate(costed.data ?? [], open.supplier_name, open.invoice_number, open.id);
    if (dup) {
      toast.error("Diese Rechnung (Lieferant + Nr.) ist bereits in den Ist-Kosten. Sie darf nicht noch einmal zählen.");
      return;
    }
    const net = invoiceNetCost(open, items);
    if (!net.complete) {
      toast.error("Nettobetrag fehlt. Brutto ohne MWST wird nicht als Materialkosten übernommen.");
      return;
    }
    const { error } = await supabase.from("supplier_invoices").update({
      review_status: "bestaetigt",
      included_in_costs: true,
    }).eq("id", open.id);
    if (error) return toast.error(error.message.includes("supplier_invoices_included_identity") ? "Rechnung bereits in den Ist-Kosten erfasst." : error.message);
    const remaining = await applyInvoiceMatches(open, items, products.data ?? []);
    toast.success("Rechnung bestätigt – Ist-Material aktualisiert");
    qc.invalidateQueries({ queryKey: ["supplier-invoices", jobId] });
    qc.invalidateQueries({ queryKey: ["supplier-invoices-costed"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    const confirmed = { ...open, review_status: "bestaetigt", included_in_costs: true };
    setOpen(null);
    if (remaining.length) {
      setQueueInv(confirmed);
      setQueue(remaining);
      setQi(0);
    }
  }

  async function remove(inv: Inv) {
    if (!confirm("Rechnung entfernen? Produktpreise bleiben unverändert.")) return;
    await supabase.storage.from("job-media").remove([inv.storage_path]);
    await supabase.from("supplier_invoices").delete().eq("id", inv.id);
    qc.invalidateQueries({ queryKey: ["supplier-invoices", jobId] });
  }

  const rows = list.data ?? [];
  const curQ = queue?.[qi] ?? null;
  const matched = (products.data ?? []).find((p) => p.id === curQ?.matched_product_id) ?? null;
  const openDup = open ? findCostDuplicate(costed.data ?? [], open.supplier_name, open.invoice_number, open.id) : null;
  const openNet = open ? invoiceNetCost(open, items) : null;
  const canInclude = open && open.review_status !== "bestaetigt" && !openDup && openNet?.complete;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="section-title">Lieferantenrechnungen</h2>
      <p className="text-sm text-muted-foreground">Foto, Screenshot oder PDF. Angaben immer prüfen, bevor Preise in die Bibliothek übernommen werden.</p>
      <div className="grid grid-cols-1 gap-2">
        <button type="button" disabled={busy} onClick={source.openChooser} className="action-tile-primary"><Camera className="h-6 w-6" />Rechnung fotografieren</button>
        <button type="button" disabled={busy} onClick={source.openChooser} className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold">
          <ImagePlus className="h-4 w-4 text-primary" /> Bild / Screenshot hochladen
        </button>
        <button type="button" disabled={busy} onClick={source.openChooser} className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-card text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" /> PDF hochladen
        </button>
      </div>
      {source.chooser}

      {!rows.length && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Noch keine Lieferantenrechnungen.</p>}
      {rows.map((inv) => (
        <div key={inv.id} className="rounded-lg border p-3">
          <button type="button" onClick={() => openInv(inv)} className="block w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{inv.supplier_name || inv.file_name || "Rechnung"}</div>
                <div className="text-sm text-muted-foreground">
                  {[inv.invoice_number, inv.invoice_date, inv.net_total != null ? formatCHF(Number(inv.net_total)) : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={extractionLabel(inv.extraction_status)} />
                <StatusBadge status={reviewLabel(inv.review_status)} />
              </div>
            </div>
          </button>
          <button type="button" className="mt-2 text-sm font-semibold text-destructive" onClick={() => remove(inv)}>Entfernen</button>
          {inv.review_status === "bestaetigt" && (inv.supplier_invoice_items ?? []).some((it) => it.review_status !== "erledigt") && (
            <button
              type="button"
              className="ml-3 mt-2 text-sm font-semibold text-primary"
              onClick={() => {
                setQueueInv(inv);
                setQueue((inv.supplier_invoice_items ?? []).filter((it) => it.review_status !== "erledigt"));
                setQi(0);
              }}
            >
              Produktabgleich fortsetzen
            </button>
          )}
        </div>
      ))}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="max-h-[94vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Rechnung prüfen</SheetTitle></SheetHeader>
          {open && (
            <div className="space-y-3 p-4 pt-0">
              {(open as Inv & { url?: string }).url && (
                open.file_type === "pdf"
                  ? <a href={(open as Inv & { url?: string }).url} target="_blank" rel="noreferrer" className="block h-11 rounded-lg border text-center text-sm font-semibold leading-[2.75rem]">PDF öffnen</a>
                  : <img src={(open as Inv & { url?: string }).url} alt="" className="max-h-48 w-full rounded-lg object-contain bg-muted" />
              )}
              {(open.extraction_status === "manuelle_pruefung" || open.notes) && (
                <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">
                  {open.notes || "PDF konnte nicht automatisch gelesen werden. Bitte Angaben manuell eintragen."}
                </p>
              )}
              {(open.extraction_confidence === "niedrig" || items.some((i) => i.confidence === "niedrig")) && (
                <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">Einige Angaben sind unsicher – bitte kontrollieren.</p>
              )}
              {openDup && (
                <div className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">
                  <p className="font-semibold">Bereits in den Ist-Kosten erfasst (gleicher Lieferant + Rechnungsnr.). Diese Rechnung darf nicht noch einmal zählen.</p>
                  {openDup.job_id === jobId && (
                    <button type="button" className="mt-2 font-semibold text-primary" onClick={() => {
                      const existing = rows.find((r) => r.id === openDup.id);
                      if (existing) void openInv(existing);
                    }}>Bestehende Rechnung öffnen</button>
                  )}
                  {openDup.job_id !== jobId && <p className="mt-1">Sie ist in einem anderen Auftrag hinterlegt.</p>}
                </div>
              )}
              {openNet && !openNet.complete && (
                <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">{openNet.reason} Bitte Netto oder Positionsnetto eintragen.</p>
              )}
              <Field label="Lieferant"><Input className="h-12 text-base" value={open.supplier_name ?? ""} onChange={(e) => setOpen({ ...open, supplier_name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rechnungsnr."><Input className="h-12 text-base" value={open.invoice_number ?? ""} onChange={(e) => setOpen({ ...open, invoice_number: e.target.value })} /></Field>
                <Field label="Datum"><Input className="h-12 text-base" type="date" value={open.invoice_date ?? ""} onChange={(e) => setOpen({ ...open, invoice_date: e.target.value || null })} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Netto"><Input className="h-12 text-base" type="number" step="any" value={open.net_total ?? ""} onChange={(e) => setOpen({ ...open, net_total: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label="MWST"><Input className="h-12 text-base" type="number" step="any" value={open.vat_amount ?? ""} onChange={(e) => setOpen({ ...open, vat_amount: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label="Brutto"><Input className="h-12 text-base" type="number" step="any" value={open.gross_total ?? ""} onChange={(e) => setOpen({ ...open, gross_total: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              </div>
              <h3 className="pt-1 text-sm font-bold">Positionen</h3>
              {items.map((it, idx) => (
                <div key={it.id} className="space-y-2 rounded-lg border p-3">
                  <Input className="h-11 text-base" value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} placeholder="Bezeichnung" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-11 text-base" placeholder="Hersteller" value={it.manufacturer ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, manufacturer: e.target.value } : x))} />
                    <Input className="h-11 text-base" placeholder="Hersteller-Art.-Nr." value={it.manufacturer_article_no ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, manufacturer_article_no: e.target.value } : x))} />
                    <Input className="h-11 text-base" placeholder="Lief.-Art.-Nr." value={it.supplier_article_no ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, supplier_article_no: e.target.value } : x))} />
                    <Input className="h-11 text-base" type="number" step="any" placeholder="Menge" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                    <Input className="h-11 text-base" placeholder="Einheit" value={it.unit} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                    <Input className="h-11 text-base" type="number" step="any" placeholder="EK / Stk" value={it.unit_price ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                    <Input className="h-11 text-base" type="number" step="any" placeholder="Rabatt" value={it.discount ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, discount: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                    <Input className="h-11 text-base" type="number" step="any" placeholder="Netto Pos." value={it.net_total ?? ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, net_total: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                    {effectiveUnitEk(it) != null && <p className="col-span-2 text-xs text-muted-foreground">Effektiver EK: {formatCHF(effectiveUnitEk(it)!)}</p>}
                  </div>
                </div>
              ))}
              <Button variant="outline" className="h-12 w-full" onClick={() => void saveDraft()}>Angaben speichern</Button>
              <Button className="h-12 w-full font-semibold" disabled={!canInclude} onClick={() => void confirmInvoice()}>
                {open.review_status === "bestaetigt" ? "Bereits bestätigt" : openDup ? "Doppelte Rechnung – nicht übernehmen" : "Rechnung bestätigen"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!curQ} onOpenChange={(o) => !o && setQueue(null)}>
        <SheetContent side="bottom" className="max-h-[94vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Produktabgleich {queue ? `${qi + 1} / ${queue.length}` : ""}</SheetTitle></SheetHeader>
          {curQ && queueInv && (
            <MatchCard
              item={curQ}
              product={matched}
              products={products.data ?? []}
              invoice={queueInv}
              onDone={async () => {
                qc.invalidateQueries({ queryKey: ["products"] });
                qc.invalidateQueries({ queryKey: ["supplier-invoices", jobId] });
                if (queue && qi + 1 < queue.length) setQi(qi + 1);
                else { setQueue(null); setQueueInv(null); }
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function MatchCard({
  item, product, products, invoice, onDone,
}: {
  item: SupplierInvoiceItem;
  product: Product | null;
  products: Product[];
  invoice: SupplierInvoice;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(item.description);
  const [pickId, setPickId] = useState(product?.id ?? "");
  const kind = item.match_kind;

  async function finish(patch: Partial<SupplierInvoiceItem>, later = false, applyMaster = false) {
    await supabase.from("supplier_invoice_items").update({ ...patch, review_status: later ? "spaeter" : "erledigt" }).eq("id", item.id);
    if (!later) {
      const pid = String(patch.product_id || item.product_id || "");
      const prod = products.find((p) => p.id === pid) ?? product;
      const ek = effectiveUnitEk(item);
      if (prod && ek != null) {
        if (patch.price_decision === "project_only") {
          await recordPriceHistory({
            product_id: prod.id,
            supplier_name: invoice.supplier_name,
            purchase_price: ek,
            invoice_date: invoice.invoice_date,
            supplier_invoice_id: invoice.id,
          });
        } else {
          await recordObservedPurchasePrice({
            product: prod,
            purchase_price: ek,
            supplier_name: invoice.supplier_name,
            invoice_date: invoice.invoice_date,
            supplier_invoice_id: invoice.id,
            updateMaster: applyMaster,
          });
        }
      } else if (prod) {
        await supabase.from("products").update({ last_purchase_date: invoice.invoice_date }).eq("id", prod.id);
      }
    }
    toast.success(later ? "Zurückgestellt" : "Übernommen");
    await onDone();
  }

  async function createProduct() {
    if (!name.trim()) return toast.error("Bezeichnung fehlt");
    const ek = effectiveUnitEk(item);
    const { data, error } = await supabase.from("products").insert({
      name: name.trim(),
      manufacturer: item.manufacturer,
      manufacturer_article_no: item.manufacturer_article_no,
      supplier_name: invoice.supplier_name,
      supplier_article_no: item.supplier_article_no,
      unit: item.unit || "Stk",
      purchase_price: ek,
      last_purchase_date: invoice.invoice_date,
      source: "invoice",
    }).select("*").single();
    if (error || !data) return toast.error(error?.message ?? "Speichern fehlgeschlagen");
    await supabase.from("supplier_invoice_items").update({ product_id: data.id, match_kind: "new_product", review_status: "erledigt" }).eq("id", item.id);
    if (ek != null) {
      await recordObservedPurchasePrice({
        product: data,
        purchase_price: ek,
        supplier_name: invoice.supplier_name,
        invoice_date: invoice.invoice_date,
        supplier_invoice_id: invoice.id,
        updateMaster: false,
      });
    }
    toast.success("Übernommen");
    await onDone();
  }

  const oldP = product?.purchase_price != null ? Number(product.purchase_price) : null;
  const newP = effectiveUnitEk(item);
  const pct = oldP && newP != null && oldP > 0 ? Math.round(((newP - oldP) / oldP) * 1000) / 10 : null;
  const reasons = matchInvoiceLine(
    {
      description: item.description,
      manufacturer: item.manufacturer,
      manufacturer_article_no: item.manufacturer_article_no,
      supplier_article_no: item.supplier_article_no,
      supplier_name: invoice.supplier_name,
      unit_price: newP,
    },
    products,
  ).reasons;

  return (
    <div className="space-y-3 p-4 pt-0">
      <div className="rounded-lg border p-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Rechnung</div>
        <div className="font-semibold">{item.description}</div>
        <div className="text-sm text-muted-foreground">{[item.manufacturer, item.manufacturer_article_no, item.supplier_article_no, newP != null ? `EK ${formatCHF(newP)}` : null].filter(Boolean).join(" · ")}</div>
      </div>

      {(!item.manufacturer_article_no?.trim() && !item.supplier_article_no?.trim()) && (
        <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">Artikelnummern fehlen – bitte ergänzen oder bewusst ohne Nummer anlegen.</p>
      )}
      {item.confidence === "niedrig" && (
        <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">Angaben unsicher – bitte kontrollieren.</p>
      )}

      {kind === "exact_match" && product && (
        <>
          <p className="text-sm font-semibold">Produkt in der Bibliothek gefunden</p>
          <p className="text-sm">{product.name}</p>
          <Button className="h-12 w-full font-semibold" onClick={() => void finish({ product_id: product.id, match_kind: "exact_match" })}>Verknüpfen</Button>
        </>
      )}

      {kind === "price_change" && product && (
        <>
          <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm font-semibold">Preisänderung erkannt</p>
          <p className="text-sm">Produkt: {product.name}</p>
          <p className="text-sm">Bisheriger EK: {oldP != null ? formatCHF(oldP) : "–"}</p>
          <p className="text-sm">Neuer EK: {newP != null ? formatCHF(newP) : "–"}</p>
          {pct != null && <p className="text-sm font-semibold">Änderung: {pct > 0 ? "+" : ""}{pct} %</p>}
          <Button className="h-12 w-full font-semibold" onClick={() => void finish({ product_id: product.id, price_decision: "apply" }, false, true)}>Neuen Preis übernehmen</Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void finish({ product_id: product.id, price_decision: "keep" })}>Alten Preis beibehalten</Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void finish({ product_id: product.id, price_decision: "project_only" })}>Nur für dieses Projekt verwenden</Button>
        </>
      )}

      {kind === "probable_match" && product && (
        <>
          <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm font-semibold">Möglicherweise bereits vorhanden</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Rechnung</div><div className="font-medium">{item.description}</div></div>
            <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">Bibliothek</div><div className="font-medium">{product.name}</div></div>
          </div>
          {reasons.length > 0 && <p className="text-sm text-muted-foreground">{reasons.join(" · ")}</p>}
          <Button className="h-12 w-full font-semibold" onClick={() => void finish({ product_id: product.id, match_kind: "exact_match" })}>Mit bestehendem Produkt verknüpfen</Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void createProduct()}>Als neues Produkt anlegen</Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void finish({}, true)}>Später entscheiden</Button>
        </>
      )}

      {(kind === "new_product" || !kind) && (
        <>
          <p className="text-sm">Als neues Produkt in die Produktbibliothek übernehmen?</p>
          <Field label="Produktname"><Input className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="text-sm text-muted-foreground">{[item.manufacturer, item.manufacturer_article_no, invoice.supplier_name, item.supplier_article_no, item.unit, newP != null ? formatCHF(newP) : null].filter(Boolean).join(" · ")}</p>
          {products.length > 0 && (
            <Field label="Oder mit bestehendem verknüpfen">
              <select className="h-12 w-full rounded-md border border-input bg-card px-3 text-base" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">–</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          {pickId && <Button className="h-12 w-full font-semibold" onClick={() => void finish({ product_id: pickId, match_kind: "exact_match" })}>Verknüpfen</Button>}
          <Button className="h-12 w-full font-semibold" onClick={() => void createProduct()}>Als neues Produkt übernehmen</Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void finish({}, true)}>Später entscheiden</Button>
        </>
      )}
    </div>
  );
}
