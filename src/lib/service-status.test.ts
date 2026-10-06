import { describe, expect, it } from "vitest";
import { displayServiceStatus, isClosed, normalizeStatus, servicePhotoCategory } from "./app";
import { isActiveJob, lifecycleOf } from "./lifecycle";

describe("service status mapping", () => {
  it("maps legacy workflow values to Offen", () => {
    expect(displayServiceStatus("Neu")).toBe("Offen");
    expect(displayServiceStatus("Geplant")).toBe("Offen");
    expect(displayServiceStatus("In Arbeit")).toBe("Offen");
    expect(displayServiceStatus("Offen")).toBe("Offen");
  });

  it("keeps Erledigt Verrechnet Abgesagt", () => {
    expect(displayServiceStatus("Erledigt")).toBe("Erledigt");
    expect(displayServiceStatus("Verrechnet")).toBe("Verrechnet");
    expect(displayServiceStatus("Abgesagt")).toBe("Abgesagt");
  });

  it("does not archive Erledigt jobs", () => {
    expect(isClosed("service", "Erledigt")).toBe(false);
    expect(isActiveJob({ job_type: "service", status: "Erledigt", lifecycle_status: "completed" })).toBe(true);
    expect(lifecycleOf({ job_type: "service", status: "Erledigt", lifecycle_status: "completed" })).toBe("active");
  });

  it("archives Verrechnet and Abgesagt", () => {
    expect(isClosed("service", "Verrechnet")).toBe(true);
    expect(isActiveJob({ job_type: "service", status: "Verrechnet" })).toBe(false);
    expect(lifecycleOf({ job_type: "service", status: "Abgesagt" })).toBe("cancelled");
  });

  it("maps legacy project stages onto the simplified workflow", () => {
    expect(normalizeStatus("project", "Aufnahme")).toBe("Begehung");
    expect(normalizeStatus("project", "Materialauswahl")).toBe("Offerte");
    expect(normalizeStatus("project", "Produktauswahl")).toBe("Offerte");
    expect(normalizeStatus("project", "Kalkulation")).toBe("Offerte");
    expect(normalizeStatus("project", "Auftrag")).toBe("Ausführung");
    expect(normalizeStatus("project", "Offerte")).toBe("Offerte");
    expect(normalizeStatus("project", "Ausführung")).toBe("Ausführung");
    expect(isClosed("project", "Abgeschlossen")).toBe(true);
  });

  it("maps service photo categories", () => {
    expect(servicePhotoCategory(null)).toBe("Allgemein");
    expect(servicePhotoCategory("Vorher")).toBe("Vorher");
    expect(servicePhotoCategory("Nachher")).toBe("Nachher");
    expect(servicePhotoCategory("Während")).toBe("Während Arbeit");
    expect(servicePhotoCategory("Bestand")).toBe("Allgemein");
  });

  it("keeps Erledigt active even when completed_at is set", () => {
    expect(isActiveJob({ job_type: "service", status: "Erledigt", lifecycle_status: "active" })).toBe(true);
  });
});
