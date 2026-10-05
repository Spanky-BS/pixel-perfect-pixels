import { describe, expect, it } from "vitest";
import { mapExtraKind, serviceBill } from "./service-billing";

describe("service billing", () => {
  it("uses Fahrzeugpauschale and ignores Fahrzeit labour", () => {
    const b = serviceBill(
      [
        { description: "Service Sanitär", hours: 2, hourly_rate: 120 },
        { description: "Fahrtzeit", hours: 1, hourly_rate: 80 },
      ],
      [{ quantity: 1, sales_price: 50 }],
      [
        { kind: "Fahrzeugpauschale", quantity: 1, price: 45 },
        { kind: "Entsorgung", quantity: 1, price: 20 },
      ],
      8.1,
    );
    expect(b.workHours).toBe(2);
    expect(b.workCHF).toBe(240);
    expect(b.materialCHF).toBe(50);
    expect(b.vehicleCHF).toBe(45);
    expect(b.extrasCHF).toBe(20);
    expect(b.subtotal).toBe(355);
    expect(b.vat).toBe(28.76);
    expect(b.total).toBe(383.76);
  });

  it("prefers Fahrzeugpauschale over legacy Anfahrt", () => {
    const b = serviceBill(
      [],
      [],
      [
        { kind: "Anfahrt", quantity: 1, price: 45 },
        { kind: "Fahrzeugpauschale", quantity: 1, price: 60 },
      ],
      8.1,
    );
    expect(b.vehicleCHF).toBe(60);
    expect(b.extrasCHF).toBe(0);
  });

  it("maps legacy Anfahrt to Fahrzeugpauschale when no pauschale row exists", () => {
    const b = serviceBill([], [], [{ kind: "Anfahrt", quantity: 1, price: 45 }], 8.1);
    expect(b.vehicleCHF).toBe(45);
    expect(b.extrasCHF).toBe(0);
  });
});

describe("mapExtraKind", () => {
  it("maps disposal and parking", () => {
    expect(mapExtraKind("20 Franken Entsorgung")).toBe("Entsorgung");
    expect(mapExtraKind("Parkgebühr")).toBe("Parkgebühren");
    expect(mapExtraKind("Sonstiges")).toBe("Sonstiges");
  });
});
