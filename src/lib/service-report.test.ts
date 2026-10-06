import { describe, expect, it } from "vitest";
import { buildServiceReport, canGenerateServiceReport, formatServiceReportNumber } from "./service-report";

const job = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0014",
  created_at: "2026-10-06T10:00:00.000Z",
  updated_at: "2026-10-06T17:42:00.000Z",
  title: "WC verstopft",
  appointment_at: "2026-10-06T17:37:00.000Z",
  completed_at: "2026-10-06T17:42:00.000Z",
  problem_description: "WC verstopft.",
  customer_request: null,
  completion_notes: "Siphon und Ablauf geprüft.",
  signature_path: "sig.png",
  city: "Reinach",
  street: "Kägenhofweg 8",
  zip: "4153",
  cancellation_reason: null,
  cancelled_at: null,
  customer_id: null,
  internal_notes: "intern",
  job_type: "service",
  lifecycle_status: "active",
  notes: null,
  status: "Erledigt",
  user_id: "u",
  work_confirmed: true,
  report_number: "RR-2026-10-01",
  report_created_at: "2026-10-06T17:50:00.000Z",
};

describe("service report", () => {
  it("formats monthly sequential rapport numbers", () => {
    expect(formatServiceReportNumber(2026, 10, 1)).toBe("RR-2026-10-01");
    expect(formatServiceReportNumber(2026, 10, 12)).toBe("RR-2026-10-12");
    expect(formatServiceReportNumber(2027, 1, 1)).toBe("RR-2027-01-01");
  });

  it("requires labour, material, extras or a signature", () => {
    expect(canGenerateServiceReport({ labour: [], material: [], extras: [] })).toBe(false);
    expect(canGenerateServiceReport({ labour: [], material: [], extras: [], signaturePath: "x" })).toBe(true);
    expect(canGenerateServiceReport({ labour: [{ description: "Fahrt", hours: 1 }], material: [], extras: [] })).toBe(false);
    expect(canGenerateServiceReport({ labour: [{ description: "Service", hours: 1 }], material: [], extras: [] })).toBe(true);
  });

  it("maps existing service entries into the report model", () => {
    const m = buildServiceReport({
      job,
      customer: { company_name: "Zeisch GmbH", first_name: "Jonas", last_name: "Zeier", phone: "079", email: null, street: null, zip: null, city: null },
      settings: { company_name: "Haustechnik Nordwestschweiz", vat_rate: 8.1, default_technician: "Timo Simonato" },
      labour: [{ description: "WC-Spülung ersetzt und Funktion geprüft", hours: 2, hourly_rate: 130, technician: "Timo Simonato" }],
      material: [{ description: "Siphon", quantity: 1, unit: "Stk", sales_price: 24 }],
      extras: [
        { kind: "Fahrzeugpauschale", description: "Fahrzeugpauschale", quantity: 1, price: 35 },
        { kind: "Entsorgung", description: "Entsorgung", quantity: 1, price: 20 },
      ],
      signatureUrl: "https://example/sig.png",
    });
    expect(m.rapportNr).toBe("RR-2026-10-01");
    expect(m.customerName).toBe("Zeisch GmbH");
    expect(m.contactPerson).toBe("Jonas Zeier");
    expect(m.labour[0]?.description).toBe("WC-Spülung ersetzt und Funktion geprüft");
    expect(m.labour[0]?.technician).toBe("Timo Simonato");
    expect(m.labour[0]?.amount).toBe(260);
    expect(m.bill.subtotal).toBe(339);
    expect(m.bill.vat).toBe(27.46);
    expect(m.bill.total).toBe(366.46);
    expect(m.signatureUrl).toBe("https://example/sig.png");
    expect(m.technicianSignatureUrl).toBe(null);
    expect(m.technicianRole).toBe("Monteur");
    expect(m.problem).toContain("WC verstopft");
    expect(m.extras.map((e) => e.name)).toEqual(["Fahrzeugpauschale", "Entsorgung"]);
  });

  it("keeps the persisted rapport number and does not invent one from the job id", () => {
    const m = buildServiceReport({
      job: { ...job, report_number: null, report_created_at: null },
      labour: [],
      material: [],
      extras: [],
    });
    expect(m.rapportNr).toBe("–");
  });

  it("does not list legacy Anfahrt when Fahrzeugpauschale exists", () => {
    const m = buildServiceReport({
      job,
      labour: [],
      material: [],
      extras: [
        { kind: "Anfahrt", description: "Anfahrt", quantity: 1, price: 45 },
        { kind: "Fahrzeugpauschale", description: "Fahrzeugpauschale", quantity: 1, price: 35 },
      ],
    });
    expect(m.extras.map((e) => e.name)).toEqual(["Fahrzeugpauschale"]);
    expect(m.bill.vehicleCHF).toBe(35);
  });
});
