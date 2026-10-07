import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { formatCHF } from "@/lib/app";
import { unitSalesPrice, type Product } from "@/lib/products";
import { fetchJobInvoices, invoiceNetCost } from "@/lib/invoices";
import { labourQuoteAmount, quotedLabour } from "@/lib/project-quote";
import { useMaterials } from "./MaterialList";
import { useLabour } from "./LabourList";
import { useTimeEntries } from "./Ausfuehrung";
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
  const times = useTimeEntries(jobId);
  const invoices = useQuery({
    queryKey: ["supplier-invoices", jobId],
    queryFn: () => fetchJobInvoices(jobId, true),
  });
  const fallbackMarkup = Number(settings.data?.default_material_markup ?? 0);
  const defaultRate = Number(settings.data?.default_hourly_rate ?? 120);
  const quoted = quotedLabour(labour.data);
  const plannedLabour = quoted.reduce((s, l) => s + labourQuoteAmount(l), 0);
  const plannedHours = quoted.reduce((s, l) => s + Number(l.hours), 0);
  const rateById = new Map(quoted.map((l) => [l.id, Number(l.hourly_rate)]));
  const istHours = (times.data ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const istLabourCHF = (times.data ?? []).reduce((s, e) => {
    const rate = rateById.get(e.labour_item_id) || defaultRate;
    return s + Number(e.hours) * rate;
  }, 0);
  const hasIstLabour = (times.data ?? []).length > 0;

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

  const actualLabour = hasIstLabour ? istLabourCHF : null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="section-title">Vorläufige Nachkalkulation</h2>
      <p className="text-sm text-muted-foreground">
        Offertwert aus der bestätigten Offerte. Ist-Stunden aus der Ausführung, bewertet zum Verkaufsansatz. Materialeinkauf aus bestätigten Lieferantenrechnungen. Interne Lohnkosten sind nicht hinterlegt. Die Kundenrechnung folgt.
      </p>
      {materialIncomplete && (
        <p className="rounded-lg border border-warning bg-warning/15 p-3 text-sm font-semibold">
          Ist-Material unvollständig: keine bestätigte Netto-Rechnung oder Nettobetrag unklar.
        </p>
      )}
      <Row label="SOLL Arbeit" value={`${plannedHours.toLocaleString("de-CH")} h · ${formatCHF(plannedLabour)}`} />
      <Row label="IST Arbeit (Verkaufsansatz)" value={actualLabour == null ? "noch keine IST-Stunden" : `${istHours.toLocaleString("de-CH")} h · ${formatCHF(actualLabour)}`} />
      <Row label="Geplanter Material-EK" value={formatCHF(plannedEk)} />
      <Row label="Geplanter Material-VK" value={formatCHF(plannedVk)} />
      <Row label="Ist-Material (netto)" value={materialIncomplete && !confirmed.length ? "–" : formatCHF(actualMaterial)} />
      <Row label="Offertwert (Arbeit + Material-VK)" value={formatCHF(plannedLabour + plannedVk)} />
      <Row label="Kundenrechnung" value="folgt (ohne Bexio)" />
      <Row label="Nach Materialeinkauf" value={materialIncomplete ? "–" : formatCHF(plannedLabour + plannedVk - actualMaterial)} />
      <p className="text-xs text-muted-foreground">Nach Materialeinkauf zieht nur den bestätigten Einkauf vom Offertwert ab. Arbeitsstunden bleiben daneben, weil kein interner Lohnkostensatz existiert.</p>
    </section>
  );
}
