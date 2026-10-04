import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `Du bist ein erfahrener Sanitärinstallateur in der Schweiz (Haustechnik Nordwestschweiz).
Du wertest eine Bestandesaufnahme (Fotos, Sprachnotizen, Textnotizen) aus und erstellst strukturierte Anforderungen.
WICHTIG: Erfinde KEINE fehlenden technischen Informationen (Dimensionen, Modelle, Anschlussarten, Farben, Marken).
Wenn etwas unklar ist, lasse das Feld leer und erstelle stattdessen einen offenen Punkt, z.B.
"genaue Dimension unklar", "Modell noch offen", "Anschlussart prüfen", "Farbe mit Kunde bestätigen", "vorhandene Leitung prüfen", "Ausführung vor Ort klären".
Gib für jede Position eine Sicherheit an: niedrig, mittel oder hoch. Antworte auf Deutsch (Schweiz, ohne ß).`;

const tool = {
  type: "function",
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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("KI-Dienst nicht konfiguriert");

    const [{ data: job }, { data: notes }, { data: photos }, { data: cats }] = await Promise.all([
      sb.from("jobs").select("title, notes, problem_description, customer_request").eq("id", data.jobId).maybeSingle(),
      sb.from("voice_notes").select("kind, transcript, created_at").eq("job_id", data.jobId).order("created_at"),
      sb.from("job_photos").select("storage_path, description, category").eq("job_id", data.jobId).order("taken_at").limit(8),
      sb.from("material_categories").select("name").order("sort_order"),
    ]);
    if (!job) throw new Error("Auftrag nicht gefunden");

    const text = [
      `Projekt: ${job.title}`,
      job.notes && `Notizen: ${job.notes}`,
      job.problem_description && `Problem: ${job.problem_description}`,
      job.customer_request && `Kundenwunsch: ${job.customer_request}`,
      `Verfügbare Materialkategorien: ${(cats ?? []).map((c) => c.name).join(", ")}`,
      ...(notes ?? []).filter((n) => n.transcript).map((n) => `${n.kind === "voice" ? "Sprachnotiz" : "Textnotiz"}: ${n.transcript}`),
      ...(photos ?? []).filter((p) => p.description || p.category).map((p, i) => `Foto ${i + 1}: ${[p.category, p.description].filter(Boolean).join(" – ")}`),
    ].filter(Boolean).join("\n");

    const content: Array<Record<string, unknown>> = [{ type: "text", text }];
    if (photos?.length) {
      const { data: urls } = await sb.storage.from("job-media").createSignedUrls(photos.map((p) => p.storage_path), 600);
      urls?.forEach((u) => u.signedUrl && content.push({ type: "image_url", image_url: { url: u.signedUrl } }));
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "erkannte_anforderungen" } },
      }),
    });
    if (res.status === 429) throw new Error("Zu viele Anfragen – bitte kurz warten.");
    if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
    if (!res.ok) throw new Error(`KI-Fehler (${res.status})`);
    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Keine Auswertung erhalten");
    const out = JSON.parse(args) as { material?: Array<Record<string, unknown>>; arbeit?: Array<Record<string, unknown>>; offene_punkte?: string[] };

    // replace previous pending suggestions
    await sb.from("ai_suggestions").delete().eq("job_id", data.jobId).eq("state", "pending");
    const rows = [
      ...(out.material ?? []).map((m) => ({ job_id: data.jobId, kind: "material", payload: m as never, confidence: String(m["sicherheit"] ?? "mittel") })),
      ...(out.arbeit ?? []).map((m) => ({ job_id: data.jobId, kind: "labour", payload: m as never, confidence: String(m["sicherheit"] ?? "mittel") })),
      ...(out.offene_punkte ?? []).map((t) => ({ job_id: data.jobId, kind: "open", payload: { text: t } as never, confidence: null })),
    ];
    if (rows.length) {
      const { error } = await sb.from("ai_suggestions").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { count: rows.length };
  });
