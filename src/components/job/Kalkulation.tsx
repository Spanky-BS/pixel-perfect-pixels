import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { settingsQuery } from "@/lib/queries";
import { formatCHF } from "@/lib/app";
import { useMaterials } from "./MaterialList";
import { useLabour } from "./LabourList";

/** Project calculation overview. Material prices arrive later with supplier integration. */
export function Kalkulation({ jobId }: { jobId: string }) {
  const settings = useQuery(settingsQuery());
  const materials = useMaterials(jobId);
  const labour = useLabour(jobId);
  const vatRate = Number(settings.data?.vat_rate ?? 8.1);
  const markup = Number(settings.data?.default_material_markup ?? 0);
  const lab = labour.data ?? [];
  const hours = lab.reduce((s, l) => s + Number(l.hours), 0);
  const labourTotal = lab.reduce((s, l) => s + Number(l.hours) * Number(l.hourly_rate), 0);
  const subtotal = labourTotal;
  const vat = Math.round(subtotal * vatRate) / 100;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Material</h2>
        <div className="mb-2 grid grid-cols-[1fr_4rem_4rem_4.5rem] gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
          <span>Position</span><span className="text-right">EK</span><span className="text-right">Zuschl.</span><span className="text-right">VK</span>
        </div>
        {(materials.data ?? []).map((m) => (
          <div key={m.id} className="grid grid-cols-[1fr_4rem_4rem_4.5rem] gap-2 border-t py-2 text-sm">
            <span className="truncate">{Number(m.quantity)} {m.unit} {m.description}</span>
            <span className="text-right text-muted-foreground">–</span>
            <span className="text-right text-muted-foreground">{markup}%</span>
            <span className="text-right text-muted-foreground">–</span>
          </div>
        ))}
        {!materials.data?.length && <p className="text-sm text-muted-foreground">Noch kein Material.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Einkaufspreise folgen mit der Produktauswahl / Lieferantenanbindung.</p>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Arbeit</h2>
        <Row label="Stunden total" value={`${hours.toLocaleString("de-CH")} h`} />
        <Row label="Arbeit total" value={formatCHF(labourTotal)} />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="section-title mb-2">Zusätzlich</h2>
        {["Kleinmaterial", "Anfahrt", "Entsorgung", "Spesen", "Pauschalen", "Reserve", "Rabatt"].map((k) => <Row key={k} label={k} value="–" muted />)}
      </section>

      <section className="rounded-xl border-2 border-primary bg-card p-4">
        <Row label="Zwischensumme" value={formatCHF(subtotal)} />
        <Row label={`MWST ${vatRate}%`} value={formatCHF(vat)} />
        <Row label="Total CHF" value={formatCHF(subtotal + vat)} bold />
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
