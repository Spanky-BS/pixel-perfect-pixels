import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { formatCHF } from "@/lib/app";
import { unitSalesPrice, type Product } from "@/lib/products";
import { fetchJobInvoices, invoiceNetCost } from "@/lib/invoices";
import { useMaterials } from "./MaterialList";
import { useLabour } from "./LabourList";
import { Row } from "./Kalkulation";

function linkedProduct(row: { products?: Product | Product[] | null }): Product | null {
  const p = row.products;
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

export function Nachkalkulation({ jobId }: { jobId: string }) {
  const settings = useQuery(settingsQuery());
  const materials = useMaterials(jobId);
  const labour = useLabour(jobId);
  const invoices = useQuery({
    queryKey: ["supplier-invoices", jobId],
    queryFn: () => fetchJobInvoices(jobId, true),
  });
  const fallbackMarkup = Number(settings.data?.default_material_markup ?? 0);
  const lab = labour.data ?? [];
  const plannedLabour = lab.reduce((s, l) => s + Number(l.hours) * Number(l.hourly_rate), 0);

  let plannedEk = 0;
  let plannedVk = 0;
  (materials.data ?? []).forEach((m) => {
    const p = linkedProduct(m as { products?: Product | Product[] | null });
    const qty = Number(m.quantity);
    if (p?.purchase_price != null) plannedEk += Number(p.purchase_price) * qty;
    const vk = p ? unitSalesPrice(p, fallbackMarkup) : null;
    if (vk != null) plannedVk += vk * qty;
  });

  const confirmed = invoices.data ?? [];
  let actualMaterial = 0;
  let materialIncomplete = !confirmed.length;
  confirmed.forEach((inv) => {
    const r = invoiceNetCost(inv, inv.supplier_invoice_items ?? []);
    if (!r.complete) materialIncomplete = true;
    else actualMaterial += r.net;
  });

  const actualRevenue: number | null = null;
  const actualLabour: number | null = null;
  const vorlaeufigTotal = actualMaterial + (actualLabour ?? plannedLabour);
  const vorlaeufigDeck = (actualRevenue ?? plannedVk) - vorlaeufigTotal;
  const vorlaeufigMarge = (actualRevenue ?? plannedVk) > 0 ? Math.round((vorlaeufigDeck / (actualRevenue ?? plannedVk)) * 1000) / 10 : null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="section-title">Vorläufige Nachkalkulation</h2>
      <p className="text-sm text-muted-foreground">
        Ist-Material aus bestätigten Lieferantenrechnungen (netto, ohne MWST). Arbeit und Kundenerlös sind noch geplant – keine endgültige Gewinnrechnung. Kundenrechnung und Ist-Zeiten folgen später.
      </p>
      {materialIncomplete && (
        <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm font-semibold">
          Ist-Material unvollständig: keine bestätigte Netto-Rechnung oder Nettobetrag unklar.
        </p>
      )}
      <Row label="Geplanter Material-EK" value={formatCHF(plannedEk)} />
      <Row label="Geplanter Material-VK" value={formatCHF(plannedVk)} />
      <Row label="Ist-Material (netto)" value={materialIncomplete && !confirmed.length ? "–" : formatCHF(actualMaterial)} />
      <Row label="Geplante Arbeit" value={formatCHF(plannedLabour)} />
      <Row label="Ist-Arbeit" value={actualLabour == null ? "folgt" : formatCHF(actualLabour)} />
      <Row label="Kundenerlös / Rechnung" value={actualRevenue == null ? "folgt (ohne Bexio)" : formatCHF(actualRevenue)} />
      <Row label="Vorläufige Kosten (Ist-Material + geplante Arbeit)" value={formatCHF(vorlaeufigTotal)} />
      <Row label="Vorläufiger Deckungsbeitrag" value={formatCHF(vorlaeufigDeck)} />
      <Row label="Vorläufige Marge" value={vorlaeufigMarge == null ? "–" : `${vorlaeufigMarge} %`} bold />
      <p className="text-xs text-muted-foreground">Marge/Deckungsbeitrag vergleichen geplanten VK mit Ist-Material und geplanter Arbeit – nicht den endgültigen Projektgewinn.</p>
    </section>
  );
}
