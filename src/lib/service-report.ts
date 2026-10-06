import { address, customerName, defaultTechnician, formatDate, type Customer, type Job } from "@/lib/app";
import { COMPANY } from "@/lib/company";
import { billedVehicleExtras, isTravelLabour, isVehicleExtra, serviceBill, type ServiceBill } from "@/lib/service-billing";

export type ServiceReportLabour = { description: string; technician: string; hours: number; rate: number; amount: number };
export type ServiceReportMaterial = { name: string; qty: number; unit: string; price: number; amount: number };
export type ServiceReportExtra = { name: string; amount: number };

export type ServiceReportModel = {
  logoUrl: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  rapportNr: string;
  title: string;
  createdAt: string;
  executedAt: string;
  technician: string;
  customerName: string;
  contactPerson: string;
  site: string;
  phone: string;
  email: string;
  problem: string;
  labour: ServiceReportLabour[];
  material: ServiceReportMaterial[];
  extras: ServiceReportExtra[];
  vatRate: number;
  bill: ServiceBill;
  signatureUrl: string | null;
  technicianSignatureUrl: string | null;
  technicianRole: string;
  technicianPhone: string;
  signerName: string;
  signedAt: string;
  filename: string;
};

export function formatServiceReportNumber(year: number, month: number, seq: number) {
  return `RR-${year}-${String(month).padStart(2, "0")}-${String(seq).padStart(2, "0")}`;
}

export function canGenerateServiceReport(input: {
  labour: Record<string, unknown>[];
  material: Record<string, unknown>[];
  extras: Record<string, unknown>[];
  signaturePath?: string | null;
}) {
  const work = input.labour.filter((r) => !isTravelLabour(r));
  return work.length > 0 || input.material.length > 0 || input.extras.length > 0 || !!input.signaturePath;
}

function dash(v: string | null | undefined) {
  const t = (v ?? "").trim();
  return t || "–";
}

function contactPerson(c?: Pick<Customer, "first_name" | "last_name" | "company_name"> | null) {
  if (!c) return "–";
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (c.company_name && person) return person;
  return person || "–";
}

function extraLabel(r: Record<string, unknown>) {
  const kind = String(r["kind"] ?? "").trim();
  const desc = String(r["description"] ?? "").trim();
  if (kind && desc && kind !== desc) return `${kind}: ${desc}`;
  return desc || kind || "Zusatz";
}

export function buildServiceReport(input: {
  job: Job;
  customer?: (Pick<Customer, "company_name" | "first_name" | "last_name" | "phone" | "email" | "street" | "zip" | "city">) | null;
  settings?: {
    company_name?: string | null;
    vat_rate?: number | null;
    default_technician?: string | null;
    technician_role?: string | null;
    technician_phone?: string | null;
  } | null;
  labour: Record<string, unknown>[];
  material: Record<string, unknown>[];
  extras: Record<string, unknown>[];
  signatureUrl?: string | null;
  technicianSignatureUrl?: string | null;
}): ServiceReportModel {
  const { job, customer, settings } = input;
  const vatRate = Number(settings?.vat_rate ?? 8.1);
  const work = input.labour.filter((r) => !isTravelLabour(r));
  const labour: ServiceReportLabour[] = work.map((r) => {
    const hours = Number(r["hours"] ?? 0);
    const rate = Number(r["hourly_rate"] ?? 0);
    return {
      description: String(r["description"] ?? "").trim() || "–",
      technician: String(r["technician"] || defaultTechnician(settings) || "").trim() || defaultTechnician(settings),
      hours,
      rate,
      amount: hours * rate,
    };
  });
  const material: ServiceReportMaterial[] = input.material.map((r) => {
    const qty = Number(r["quantity"] ?? 0);
    const price = Number(r["sales_price"] ?? 0);
    return {
      name: String(r["description"] || "–"),
      qty,
      unit: String(r["unit"] || "Stk"),
      price,
      amount: qty * price,
    };
  });
  const extras: ServiceReportExtra[] = [
    ...billedVehicleExtras(input.extras),
    ...input.extras.filter((r) => !isVehicleExtra(r)),
  ].map((r) => ({
    name: extraLabel(r),
    amount: Number(r["quantity"] ?? 0) * Number(r["price"] ?? 0),
  }));

  const technician =
    labour.find((r) => r.technician)?.technician || defaultTechnician(settings);
  const executed =
    job.appointment_at ||
    (work.find((r) => r["start_at"])?.["start_at"] as string | undefined) ||
    job.completed_at ||
    job.created_at;
  const rapportNr = job.report_number?.trim() || "–";
  const reportDate = job.report_created_at || job.created_at;
  const site = address(job) || (customer ? address(customer) : "") || "–";
  const problem = [job.problem_description, job.customer_request].filter((s) => s?.trim()).join("\n\n") || "–";

  const person = contactPerson(customer);
  const signer = person !== "–" ? person : customerName(customer);

  return {
    logoUrl: COMPANY.logoUrl,
    companyName: settings?.company_name?.trim() || COMPANY.name,
    companyAddress: `${COMPANY.street}, ${COMPANY.zipCity}`,
    companyPhone: COMPANY.phone,
    companyEmail: COMPANY.email,
    companyWebsite: COMPANY.website,
    rapportNr,
    title: job.title,
    createdAt: formatDate(reportDate),
    executedAt: formatDate(executed),
    technician,
    customerName: customerName(customer),
    contactPerson: person,
    site,
    phone: dash(customer?.phone),
    email: dash(customer?.email),
    problem,
    labour,
    material,
    extras,
    vatRate,
    bill: serviceBill(input.labour, input.material, input.extras, vatRate),
    signatureUrl: input.signatureUrl ?? null,
    technicianSignatureUrl: input.technicianSignatureUrl ?? null,
    technicianRole: settings?.technician_role?.trim() || "Monteur",
    technicianPhone: dash(settings?.technician_phone),
    signerName: signer,
    signedAt: job.completed_at ? formatDate(job.completed_at, true) : formatDate(job.updated_at, true),
    filename: `Regierapport-${rapportNr === "–" ? job.id.slice(0, 8) : rapportNr}`,
  };
}

export const SERVICE_REPORT_CSS = `
@page { size: A4 portrait; margin: 12mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
body { font-family: "IBM Plex Sans", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.35; }
.sr-page { width: 186mm; max-width: 100%; margin: 0 auto; color: #1a1a1a; background: #fff; }
.sr-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid #1e4d8c; }
.sr-logo { height: 48px; width: auto; object-fit: contain; }
.sr-co { text-align: right; font-size: 8.5pt; color: #1e4d8c; line-height: 1.4; }
.sr-co strong { display: block; font-size: 9.5pt; }
.sr-title { margin: 12px 0 4px; font-size: 22pt; font-weight: 700; color: #1e4d8c; letter-spacing: -0.02em; }
.sr-sub { margin: 0 0 12px; font-size: 10pt; color: #5a6b80; }
.sr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.sr-box { border: 1px solid #c5d4e8; overflow: hidden; }
.sr-box h3 { margin: 0; padding: 5px 8px; background: #1e4d8c; color: #fff; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.sr-box dl { margin: 0; padding: 6px 8px; display: grid; grid-template-columns: 38% 62%; gap: 3px 8px; }
.sr-box dt { color: #5a6b80; font-weight: 600; }
.sr-box dd { margin: 0; font-weight: 500; }
.sr-sec { margin: 10px 0; border: 1px solid #c5d4e8; }
.sr-sec h3 { margin: 0; padding: 5px 8px; background: #1e4d8c; color: #fff; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.sr-sec p { margin: 0; padding: 8px; white-space: pre-wrap; }
.sr-table { width: 100%; border-collapse: collapse; }
.sr-table th { background: #1e4d8c; color: #fff; font-size: 8pt; font-weight: 700; text-align: left; padding: 5px 6px; }
.sr-table th.num, .sr-table td.num { text-align: right; }
.sr-table td { padding: 5px 6px; border-bottom: 1px solid #e3eaf3; vertical-align: top; }
.sr-table tfoot td { font-weight: 700; background: #f4f7fb; border-bottom: none; }
.sr-tot { margin-top: 10px; border: 1px solid #1e4d8c; width: 100%; }
.sr-tot h3 { margin: 0; padding: 5px 8px; background: #1e4d8c; color: #fff; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.sr-tot table { width: 100%; border-collapse: collapse; }
.sr-tot td { padding: 5px 8px; }
.sr-tot .num { text-align: right; font-variant-numeric: tabular-nums; }
.sr-tot .grand { background: #1e4d8c; color: #fff; font-weight: 700; font-size: 11pt; }
.sr-sig { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: end; }
.sr-sig h3 { font-size: 8.5pt; color: #1e4d8c; margin: 0 0 6px; }
.sr-sig p { margin: 0 0 6px; }
.sr-sig-box {
  width: 170px;
  height: 68px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4px 6px 2px;
  overflow: hidden;
}
.sr-sig-box img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: left bottom;
}
.sr-sig-empty {
  width: 170px;
  height: 68px;
  display: flex;
  align-items: flex-end;
  color: #5a6b80;
  font-size: 8pt;
  font-style: italic;
  padding: 0 0 4px;
}
.sr-line { margin-top: 0; border-top: 1px solid #1a1a1a; padding-top: 4px; font-size: 8.5pt; color: #5a6b80; }
.sr-foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #c5d4e8; font-size: 7.5pt; color: #5a6b80; display: flex; justify-content: space-between; }
.sr-muted { color: #5a6b80; font-style: italic; padding: 8px; }
@media print {
  body { background: #fff; }
  .sr-page { width: auto; }
  thead { display: table-header-group; }
  tr, img { break-inside: avoid; }
}
`;
