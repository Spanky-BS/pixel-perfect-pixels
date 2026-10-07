import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { settingsQuery } from "@/lib/queries";
import { formatCHF, isQuotedLabour } from "@/lib/app";
import { unitSalesPrice, type Product } from "@/lib/products";
import { useMaterials } from "./MaterialList";
import { useLabour } from "./LabourList";

function linkedProduct(row: { products?: Product | Product[] | null }): Product | null {
  const p = row.products;
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

export function Kalkulation({ jobId }: { jobId: string }) {
  const settings = useQuery(settingsQuery());
  const materials = useMaterials(jobId);
  const labour = useLabour(jobId);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const fallbackMarkup = Number(settings.data?.default_material_markup ?? 0);
  const lab = (labour.data ?? []).filter(isQuotedLabour);
  const hours = lab.reduce((s, l) => s + Number(l.hours), 0);
  const labourTotal = lab.reduce((s, l) => s + Number(l.hours) * Number(l.hourly_rate), 0);

  let materialTotal = 0;
  const lines = (materials.data ?? []).map((m) => {
    const p = linkedProduct(m as { products?: Product | Product[] | null });
    const qty = Number(m.quantity);
    const ekUnit = p?.purchase_price != null ? Number(p.purchase_price) : null;
    const vkUnit = p ? unitSalesPrice(p, fallbackMarkup) : null;
    const ek = ekUnit != null ? ekUnit * qty : null;
    const vk = vkUnit != null ? vkUnit * qty : null;
    if (vk != null) materialTotal += vk;
    const markupPct = p?.sales_price != null
      ? (ekUnit != null && ekUnit > 0 ? Math.round(((Number(p.sales_price) / ekUnit) - 1) * 1000) / 10 : fallbackMarkup)
      : (p?.markup != null ? Number(p.markup) : fallbackMarkup);
    return { m, ek, vk, productName: p?.name, markupPct, priced: vk != null };
  });
  const unpriced = lines.filter((l) => !l.priced).length;
  const incomplete = unpriced > 0;
  const subtotal = labourTotal + materialTotal;
  const vat = Math.round(subtotal * vatRate) / 100;
  const totalLabel = incomplete ? "Total CHF (vorläufig)" : "Total CHF";

  return (
    <div className="space-y-4">
      {incomplete && (
        <div className="rounded-xl border-2 border-warning bg-warning/15 p-4 text-sm font-semibold">
          {unpriced} Materialposition{unpriced === 1 ? "" : "en"} ohne Preis – Kalkulation unvollständig
        </div>
      )}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Material</h2>
        <div className="mb-2 grid grid-cols-[1fr_4rem_4rem_4.5rem] gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
          <span>Position</span><span className="text-right">EK</span><span className="text-right">Zuschl.</span><span className="text-right">VK</span>
        </div>
        {lines.map(({ m, ek, vk, productName, markupPct, priced }) => (
          <div key={m.id} className="grid grid-cols-[1fr_4rem_4rem_4.5rem] gap-2 border-t py-2 text-sm">
            <span className="truncate">{Number(m.quantity)} {m.unit} {productName || m.description}</span>
            <span className={`text-right ${ek == null ? "text-muted-foreground" : "font-mono"}`}>{ek == null ? "–" : formatCHF(ek)}</span>
            <span className="text-right text-muted-foreground">{priced ? `${markupPct}%` : "–"}</span>
            <span className={`text-right ${vk == null ? "text-muted-foreground" : "font-mono"}`}>{vk == null ? "–" : formatCHF(vk)}</span>
          </div>
        ))}
        {!materials.data?.length && <p className="text-sm text-muted-foreground">Noch kein Material.</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          {incomplete
            ? "Positionen ohne Preis werden nicht als 0 CHF gezählt. Total ist vorläufig."
            : "Materialpreise aus der Produktbibliothek."}
        </p>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Arbeit</h2>
        <Row label="Stunden total" value={`${hours.toLocaleString("de-CH")} h`} />
        <Row label="Arbeit total" value={formatCHF(labourTotal)} />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Zusätzlich</h2>
        {["Kleinmaterial", "Fahrzeugpauschale", "Entsorgung", "Spesen", "Pauschalen", "Reserve", "Rabatt"].map((k) => <Row key={k} label={k} value="–" muted />)}
      </section>

      <section className={`rounded-xl border-2 bg-card p-4 ${incomplete ? "border-warning" : "border-primary"}`}>
        {incomplete && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">Vorläufig – Preise fehlen</p>}
        <Row label={incomplete ? "Zwischensumme (vorläufig)" : "Zwischensumme"} value={formatCHF(subtotal)} />
        <Row label={`MWST ${vatRate}%`} value={formatCHF(vat)} />
        <Row label={totalLabel} value={formatCHF(subtotal + vat)} bold />
      </section>

      <button disabled className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-muted-foreground opacity-70">
        <FileText className="h-4 w-4" /> Offerte in Bexio erstellen (folgt)
      </button>
    </div>
  );
}

export function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "border-t pt-2 text-lg font-bold" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span className="font-mono">{value}</span>
    </div>
  );
}
