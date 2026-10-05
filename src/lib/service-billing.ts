import { EXTRA_COST_KINDS, VEHICLE_KIND } from "./app";

export function isTravelLabour(r: Record<string, unknown>) {
  return /fahrt|anfahr|reise/i.test(String(r["description"] ?? ""));
}

function kindOf(r: Record<string, unknown>) {
  return String(r["kind"] ?? "");
}

/** Hidden from Zusatzkosten; billed as the single vehicle line. */
export function isVehicleExtra(r: Record<string, unknown>) {
  const k = kindOf(r);
  return k === VEHICLE_KIND || k === "Anfahrt";
}

function vehicleRows(ext: Record<string, unknown>[]) {
  const pauschale = ext.filter((r) => kindOf(r) === VEHICLE_KIND);
  if (pauschale.length) return pauschale;
  return ext.filter((r) => kindOf(r) === "Anfahrt");
}

export function pickVehicleExtra(ext: Record<string, unknown>[]) {
  return vehicleRows(ext)[0] ?? null;
}

export type ServiceBill = {
  workHours: number;
  workCHF: number;
  materialCHF: number;
  vehicleCHF: number;
  extrasCHF: number;
  subtotal: number;
  vat: number;
  total: number;
};

export function serviceBill(
  lab: Record<string, unknown>[],
  mat: Record<string, unknown>[],
  ext: Record<string, unknown>[],
  vatRate = 8.1,
): ServiceBill {
  const work = lab.filter((r) => !isTravelLabour(r));
  const workHours = work.reduce((s, r) => s + Number(r["hours"]), 0);
  const workCHF = work.reduce((s, r) => s + Number(r["hours"]) * Number(r["hourly_rate"]), 0);
  const materialCHF = mat.reduce((s, r) => s + Number(r["quantity"]) * Number(r["sales_price"]), 0);
  const vehicleCHF = vehicleRows(ext).reduce((s, r) => s + Number(r["quantity"]) * Number(r["price"]), 0);
  const extrasCHF = ext.filter((r) => !isVehicleExtra(r)).reduce((s, r) => s + Number(r["quantity"]) * Number(r["price"]), 0);
  const subtotal = workCHF + materialCHF + vehicleCHF + extrasCHF;
  const vat = Math.round(subtotal * vatRate) / 100;
  return { workHours, workCHF, materialCHF, vehicleCHF, extrasCHF, subtotal, vat, total: subtotal + vat };
}

export function mapExtraKind(art: string | null | undefined): string {
  const t = (art ?? "").toLowerCase();
  if (/entsorg/.test(t)) return "Entsorgung";
  if (/park/.test(t)) return "Parkgebühren";
  if (/fremd/.test(t)) return "Fremdleistung";
  if (/kleinmaterial|kleinmat/.test(t)) return "Kleinmaterial";
  if (/spesen/.test(t)) return "Spesen";
  if (EXTRA_COST_KINDS.includes(art as (typeof EXTRA_COST_KINDS)[number])) return art as string;
  return "Sonstiges";
}
