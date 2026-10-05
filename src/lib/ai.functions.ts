import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { completeChat } from "@/lib/ai/provider";
import { classifyDoc, extractDocumentBytes } from "@/lib/ai/extract-document";
import { nameOverlap } from "@/lib/invoice-match";
import { unitSalesPrice } from "@/lib/products";
import { mapExtraKind } from "@/lib/service-billing";

const SYSTEM = `Du bist ein erfahrener Sanitärinstallateur in der Schweiz (Haustechnik Nordwestschweiz).
Du wertest eine Bestandesaufnahme (Fotos, Sprachnotizen, Textnotizen, Unterlagen) aus und erstellst strukturierte Anforderungen.
WICHTIG: Erfinde KEINE fehlenden technischen Informationen (Dimensionen, Modelle, Anschlussarten, Farben, Marken).
Wenn etwas unklar ist, lasse das Feld leer und erstelle stattdessen einen offenen Punkt, z.B.
"genaue Dimension unklar", "Modell noch offen", "Anschlussart prüfen", "Farbe mit Kunde bestätigen", "vorhandene Leitung prüfen", "Ausführung vor Ort klären".
Unterlagen (PDF-Text, CSV, Excel) nur verwenden, soweit der Inhalt vorliegt. Erfinde nichts aus Dateinamen.
Gib für jede Position eine Sicherheit an: niedrig, mittel oder hoch. Antworte auf Deutsch (Schweiz, ohne ß).`;

const tool = {
  type: "function" as const,
  function: {
    name: "erkannte_anforderungen",
    description: "Strukturierte Anforderungen aus der Bestandesaufnahme",
    parameters: {
      type: "object",
      properties: {
        material: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kategorie: { type: "string" }, beschreibung: { type: "string" }, menge: { type: "number" }, einheit: { type: "string" },
              marke: { type: "string" }, dimension: { type: "string" }, ausfuehrung: { type: "string" }, notiz: { type: "string" },
              sicherheit: { type: "string", enum: ["niedrig", "mittel", "hoch"] },
            },
            required: ["beschreibung", "sicherheit"],
          },
        },
        arbeit: {
          type: "array",
          items: {
            type: "object",
            properties: { beschreibung: { type: "string" }, stunden: { type: "number" }, notiz: { type: "string" }, sicherheit: { type: "string", enum: ["niedrig", "mittel", "hoch"] } },
            required: ["beschreibung", "sicherheit"],
          },
        },
        offene_punkte: { type: "array", items: { type: "string" } },
      },
      required: ["material", "arbeit", "offene_punkte"],
    },
  },
};

export const analyzeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const [{ data: job }, { data: notes }, { data: photos }, { data: cats }, { data: docs }] = await Promise.all([
      sb.from("jobs").select("title, notes, problem_description, customer_request").eq("id", data.jobId).maybeSingle(),
      sb.from("voice_notes").select("kind, transcript, created_at").eq("job_id", data.jobId).order("created_at"),
      sb.from("job_photos").select("storage_path, description, category").eq("job_id", data.jobId).order("taken_at").limit(8),
      sb.from("material_categories").select("name").order("sort_order"),
      sb.from("job_documents").select("storage_path, file_name, file_type, mime_type").eq("job_id", data.jobId).order("created_at"),
    ]);
    if (!job) throw new Error("Auftrag nicht gefunden");

    const skippedDocuments: string[] = [];
    const docTexts: string[] = [];
    const docImagePaths: string[] = [];

    for (const doc of docs ?? []) {
      const kind = classifyDoc(doc.file_name, doc.mime_type, doc.file_type);
      if (kind === "image") {
        docImagePaths.push(doc.storage_path);
        continue;
      }
      const { data: file } = await sb.storage.from("job-media").download(doc.storage_path);
      if (!file) {
        skippedDocuments.push(doc.file_name);
        continue;
      }
      const extracted = await extractDocumentBytes(new Uint8Array(await file.arrayBuffer()), {
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        fileType: doc.file_type,
      });
      if (extracted.ok) docTexts.push(`Unterlage «${doc.file_name}» (${extracted.kind}):\n${extracted.text}`);
      else skippedDocuments.push(`${doc.file_name} (${extracted.reason})`);
    }

    const text = [
      `Projekt: ${job.title}`,
      job.notes && `Notizen: ${job.notes}`,
      job.problem_description && `Problem: ${job.problem_description}`,
      job.customer_request && `Kundenwunsch: ${job.customer_request}`,
      `Verfügbare Materialkategorien: ${(cats ?? []).map((c) => c.name).join(", ")}`,
      ...(notes ?? []).filter((n) => n.transcript).map((n) => `${n.kind === "voice" ? "Sprachnotiz" : "Textnotiz"}: ${n.transcript}`),
      ...(photos ?? []).filter((p) => p.description || p.category).map((p, i) => `Foto ${i + 1}: ${[p.category, p.description].filter(Boolean).join(" – ")}`),
      ...docTexts,
      skippedDocuments.length
        ? `Diese Unterlagen liegen vor, wurden aber NICHT automatisch ausgewertet: ${skippedDocuments.join("; ")}`
        : null,
    ].filter(Boolean).join("\n");

    const content: Array<Record<string, unknown>> = [{ type: "text", text }];
    const imagePaths = [...(photos ?? []).map((p) => p.storage_path), ...docImagePaths].slice(0, 8);
    if (imagePaths.length) {
      const { data: urls } = await sb.storage.from("job-media").createSignedUrls(imagePaths, 600);
      urls?.forEach((u) => u.signedUrl && content.push({ type: "image_url", image_url: { url: u.signedUrl } }));
    }

    const { toolArguments } = await completeChat({
      system: SYSTEM,
      userContent: content,
      tools: [tool],
      toolName: "erkannte_anforderungen",
    });
    if (!toolArguments) throw new Error("Keine Auswertung erhalten");
    const out = JSON.parse(toolArguments) as { material?: Array<Record<string, unknown>>; arbeit?: Array<Record<string, unknown>>; offene_punkte?: string[] };

    const open = [...(out.offene_punkte ?? [])];
    skippedDocuments.forEach((name) => {
      const msg = `Unterlage nicht automatisch ausgewertet: ${name}`;
      if (!open.includes(msg)) open.push(msg);
    });

    await sb.from("ai_suggestions").delete().eq("job_id", data.jobId).eq("state", "pending");
    const rows = [
      ...(out.material ?? []).map((m) => ({ job_id: data.jobId, kind: "material", payload: m as never, confidence: String(m["sicherheit"] ?? "mittel") })),
      ...(out.arbeit ?? []).map((m) => ({ job_id: data.jobId, kind: "labour", payload: m as never, confidence: String(m["sicherheit"] ?? "mittel") })),
      ...open.map((t) => ({ job_id: data.jobId, kind: "open", payload: { text: t } as never, confidence: null })),
    ];
    if (rows.length) {
      const { error } = await sb.from("ai_suggestions").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { count: rows.length, skippedDocuments };
  });

const SERVICE_CAPTURE_SYSTEM = `Du erfasst ausgeführte Sanitär-Regiearbeiten in der Schweiz (Haustechnik Nordwestschweiz).
Der Techniker beschreibt die erledigte Arbeit frei (Sprache oder Text). Du strukturierst das.
Erfinde KEINE Positionen, die nicht erwähnt wurden.
KEINE Fahrzeit, KEINE Anfahrt als eigene Position.
Fahrzeugpauschale nur, wenn der Techniker sie erwähnt oder klar eine Anfahrt/Fahrzeugpauschale gemeint ist – dann als pauschaler CHF-Betrag, nie als Stunden.
Antworte auf Deutsch (Schweiz, ohne ß).`;

const serviceCaptureTool = {
  type: "function" as const,
  function: {
    name: "erfasste_regie",
    description: "Strukturierte Regie-Erfassung aus der Beschreibung des Technikers",
    parameters: {
      type: "object",
      properties: {
        arbeit: {
          type: "array",
          items: {
            type: "object",
            properties: {
              beschreibung: { type: "string" },
              stunden: { type: "number" },
            },
            required: ["beschreibung"],
          },
        },
        material: {
          type: "array",
          items: {
            type: "object",
            properties: {
              beschreibung: { type: "string" },
              menge: { type: "number" },
              einheit: { type: "string" },
            },
            required: ["beschreibung"],
          },
        },
        fahrzeugpauschale: {
          type: "object",
          properties: {
            anwenden: { type: "boolean" },
            betrag: { type: "number" },
          },
        },
        zusatzkosten: {
          type: "array",
          items: {
            type: "object",
            properties: {
              art: { type: "string" },
              beschreibung: { type: "string" },
              betrag: { type: "number" },
            },
            required: ["beschreibung"],
          },
        },
        abschlussnotiz: { type: "string" },
      },
      required: ["arbeit", "material", "zusatzkosten"],
    },
  },
};

export type ServiceCaptureProposal = {
  labour: Array<{ description: string; hours: number }>;
  material: Array<{
    description: string;
    quantity: number;
    unit: string;
    productId: string | null;
    productName: string | null;
    salesPrice: number | null;
  }>;
  vehicle: { apply: boolean; amount: number } | null;
  extras: Array<{ kind: string; description: string; amount: number }>;
  notes: string;
};

export const extractServiceCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    jobId: z.string().uuid(),
    extraText: z.string().optional(),
    usePhotos: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<ServiceCaptureProposal> => {
    const sb = context.supabase;
    const [{ data: job }, { data: notes }, { data: settings }, { data: products }, { data: photos }] = await Promise.all([
      sb.from("jobs").select("title, problem_description, customer_request, completion_notes").eq("id", data.jobId).maybeSingle(),
      sb.from("voice_notes").select("kind, transcript").eq("job_id", data.jobId).order("created_at"),
      sb.from("settings").select("vehicle_fee").maybeSingle(),
      sb.from("products").select("id, name, unit, sales_price, purchase_price, markup").eq("active", true),
      data.usePhotos
        ? sb.from("job_photos").select("storage_path").eq("job_id", data.jobId).order("taken_at", { ascending: false }).limit(4)
        : Promise.resolve({ data: [] as { storage_path: string }[] }),
    ]);
    if (!job) throw new Error("Auftrag nicht gefunden");

    const text = [
      `Auftrag: ${job.title}`,
      job.problem_description && `Problem: ${job.problem_description}`,
      job.customer_request && `Kundenwunsch: ${job.customer_request}`,
      ...(notes ?? []).filter((n) => n.transcript).map((n) => `${n.kind === "voice" ? "Sprache" : "Text"}: ${n.transcript}`),
      data.extraText?.trim() && `Aktuelle Beschreibung: ${data.extraText.trim()}`,
      data.usePhotos && "Fotos liegen bei. Nur sichtbare, eindeutige Angaben übernehmen. Keine Preise, Art.-Nr. oder Spezifikationen erfinden.",
    ].filter(Boolean).join("\n");
    const imagePaths = (photos ?? []).map((p) => p.storage_path);
    if (!text.replace(`Auftrag: ${job.title}`, "").trim() && !imagePaths.length) {
      throw new Error("Keine Beschreibung – bitte Sprache, Text oder Foto erfassen");
    }

    const content: Array<Record<string, unknown>> = [{ type: "text", text }];
    if (imagePaths.length) {
      const { data: urls } = await sb.storage.from("job-media").createSignedUrls(imagePaths, 600);
      urls?.forEach((u) => u.signedUrl && content.push({ type: "image_url", image_url: { url: u.signedUrl } }));
    }

    const { toolArguments } = await completeChat({
      system: SERVICE_CAPTURE_SYSTEM,
      userContent: content,
      tools: [serviceCaptureTool],
      toolName: "erfasste_regie",
    });
    if (!toolArguments) throw new Error("Keine Auswertung erhalten");
    const out = JSON.parse(toolArguments) as {
      arbeit?: Array<{ beschreibung?: string; stunden?: number }>;
      material?: Array<{ beschreibung?: string; menge?: number; einheit?: string }>;
      fahrzeugpauschale?: { anwenden?: boolean; betrag?: number };
      zusatzkosten?: Array<{ art?: string; beschreibung?: string; betrag?: number }>;
      abschlussnotiz?: string;
    };

    const lib = products ?? [];

    const labour = (out.arbeit ?? [])
      .filter((a) => (a.beschreibung ?? "").trim())
      .map((a) => ({
        description: String(a.beschreibung).trim(),
        hours: typeof a.stunden === "number" && Number.isFinite(a.stunden) ? a.stunden : 1,
      }));

    const material = (out.material ?? [])
      .filter((m) => (m.beschreibung ?? "").trim())
      .map((m) => {
        const description = String(m.beschreibung).trim();
        const scored = lib
          .map((p) => ({ p, score: nameOverlap(description, p.name) }))
          .sort((a, b) => b.score - a.score);
        const hit = scored[0] && scored[0].score >= 0.5 ? scored[0].p : null;
        return {
          description,
          quantity: typeof m.menge === "number" && Number.isFinite(m.menge) ? m.menge : 1,
          unit: (m.einheit || hit?.unit || "Stk").trim() || "Stk",
          productId: hit?.id ?? null,
          productName: hit?.name ?? null,
          salesPrice: hit ? unitSalesPrice(hit) : null,
        };
      });

    const defaultFee = Number(settings?.vehicle_fee ?? 0);
    const fz = out.fahrzeugpauschale;
    const vehicle = fz?.anwenden
      ? { apply: true, amount: typeof fz.betrag === "number" && Number.isFinite(fz.betrag) ? fz.betrag : defaultFee }
      : null;

    const extras = (out.zusatzkosten ?? [])
      .filter((e) => (e.beschreibung ?? "").trim() || (e.art ?? "").trim())
      .filter((e) => !/fahrt|anfahr|fahrzeug/i.test(`${e.art ?? ""} ${e.beschreibung ?? ""}`))
      .map((e) => ({
        kind: mapExtraKind(e.art || e.beschreibung),
        description: String(e.beschreibung || e.art || "Zusatzkosten").trim(),
        amount: typeof e.betrag === "number" && Number.isFinite(e.betrag) ? e.betrag : 0,
      }));

    return {
      labour,
      material,
      vehicle,
      extras,
      notes: String(out.abschlussnotiz ?? "").trim(),
    };
  });
