import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { completeChat } from "@/lib/ai/provider";
import { extractDocumentBytes } from "@/lib/ai/extract-document";

const SYSTEM = `Du liest Lieferantenrechnungen aus der Schweizer Sanitärbranche (Haustechnik).
Lies nur, was auf der Rechnung steht. Erfinde keine Artikelnummern, Preise oder Lieferanten.
Beträge sind Netto (ohne MWST), ausser es ist ausdrücklich anders gekennzeichnet.
Währung in der Regel CHF. Datum im Format JJJJ-MM-TT.
Sicherheit je Position: niedrig, mittel oder hoch.
Antworte auf Deutsch (Schweiz, ohne ß).`;

const tool = {
  type: "function" as const,
  function: {
    name: "rechnung_auslesen",
    description: "Strukturierte Daten einer Lieferantenrechnung",
    parameters: {
      type: "object",
      properties: {
        lieferant: { type: "string" },
        rechnungsnummer: { type: "string" },
        rechnungsdatum: { type: "string" },
        waehrung: { type: "string" },
        netto: { type: "number" },
        mwst: { type: "number" },
        brutto: { type: "number" },
        sicherheit: { type: "string", enum: ["niedrig", "mittel", "hoch"] },
        positionen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lieferanten_art_nr: { type: "string" },
              hersteller: { type: "string" },
              hersteller_art_nr: { type: "string" },
              beschreibung: { type: "string" },
              menge: { type: "number" },
              einheit: { type: "string" },
              einzelpreis: { type: "number" },
              rabatt: { type: "number" },
              netto: { type: "number" },
              sicherheit: { type: "string", enum: ["niedrig", "mittel", "hoch"] },
            },
            required: ["beschreibung", "sicherheit"],
          },
        },
      },
      required: ["positionen", "sicherheit"],
    },
  },
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function dateStr(v: unknown): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export const extractSupplierInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: inv, error } = await sb.from("supplier_invoices").select("*").eq("id", data.invoiceId).maybeSingle();
    if (error || !inv) throw new Error("Rechnung nicht gefunden");

    await sb.from("supplier_invoices").update({ extraction_status: "wird_gelesen" }).eq("id", inv.id);

    const isPdf = inv.file_type === "pdf" || inv.file_name.toLowerCase().endsWith(".pdf");
    const content: Array<Record<string, unknown>> = [];

    if (isPdf) {
      const { data: file, error: dlErr } = await sb.storage.from("job-media").download(inv.storage_path);
      if (dlErr || !file) {
        await sb.from("supplier_invoices").update({ extraction_status: "manuelle_pruefung", notes: "PDF konnte nicht geladen werden." }).eq("id", inv.id);
        return { ok: false, manual: true, lines: 0 };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractDocumentBytes(bytes, { fileName: inv.file_name, fileType: "pdf", mimeType: "application/pdf" });
      if (!extracted.ok) {
        await sb.from("supplier_invoices").update({
          extraction_status: "manuelle_pruefung",
          extraction_confidence: "niedrig",
          notes: extracted.reason,
        }).eq("id", inv.id);
        return { ok: false, manual: true, lines: 0 };
      }
      content.push({
        type: "text",
        text: `Bitte diese Lieferantenrechnung auslesen (PDF-Text aus ${inv.file_name}):\n\n${extracted.text}`,
      });
    } else {
      const { data: signed } = await sb.storage.from("job-media").createSignedUrl(inv.storage_path, 600);
      const url = signed?.signedUrl;
      if (!url) {
        await sb.from("supplier_invoices").update({ extraction_status: "fehlgeschlagen" }).eq("id", inv.id);
        throw new Error("Datei konnte nicht geladen werden");
      }
      content.push({ type: "text", text: `Bitte diese Lieferantenrechnung auslesen (Bild: ${inv.file_name}).` });
      content.push({ type: "image_url", image_url: { url } });
    }

    try {
      const { toolArguments } = await completeChat({
        system: SYSTEM,
        userContent: content,
        tools: [tool],
        toolName: "rechnung_auslesen",
      });
      if (!toolArguments) throw new Error("Keine Auswertung erhalten");
      const out = JSON.parse(toolArguments) as Record<string, unknown>;
      const lines = Array.isArray(out["positionen"]) ? (out["positionen"] as Array<Record<string, unknown>>) : [];

      const { error: upErr } = await sb.from("supplier_invoices").update({
        supplier_name: str(out["lieferant"]),
        invoice_number: str(out["rechnungsnummer"]),
        invoice_date: dateStr(out["rechnungsdatum"]),
        currency: str(out["waehrung"]) || "CHF",
        net_total: num(out["netto"]),
        vat_amount: num(out["mwst"]),
        gross_total: num(out["brutto"]),
        extraction_confidence: str(out["sicherheit"]) || "mittel",
        extraction_status: "ausgelesen",
        notes: null,
      }).eq("id", inv.id);
      if (upErr) throw new Error(upErr.message);

      await sb.from("supplier_invoice_items").delete().eq("invoice_id", inv.id);
      if (lines.length) {
        const rows = lines.map((p, i) => ({
          invoice_id: inv.id,
          sort_order: i,
          supplier_article_no: str(p["lieferanten_art_nr"]),
          manufacturer: str(p["hersteller"]),
          manufacturer_article_no: str(p["hersteller_art_nr"]),
          description: str(p["beschreibung"]) ?? "",
          quantity: num(p["menge"]) ?? 1,
          unit: str(p["einheit"]) || "Stk",
          unit_price: num(p["einzelpreis"]),
          discount: num(p["rabatt"]),
          net_total: num(p["netto"]),
          confidence: str(p["sicherheit"]) || "mittel",
          review_status: "offen",
        }));
        const { error: iErr } = await sb.from("supplier_invoice_items").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }
      return { ok: true, manual: false, lines: lines.length };
    } catch (e) {
      await sb.from("supplier_invoices").update({ extraction_status: isPdf ? "manuelle_pruefung" : "fehlgeschlagen" }).eq("id", inv.id);
      if (isPdf) return { ok: false, manual: true, lines: 0 };
      throw e instanceof Error ? e : new Error("Auslesen fehlgeschlagen");
    }
  });
