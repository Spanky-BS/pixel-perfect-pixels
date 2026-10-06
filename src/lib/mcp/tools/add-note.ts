import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_job_notes",
  title: "Auftragsnotiz ergänzen",
  description: "Append a text to the notes of one of the signed-in user's jobs.",
  inputSchema: {
    job_id: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ job_id, text }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data: job, error } = await sb.from("jobs").select("id,notes").eq("id", job_id).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!job) throw new ToolError("Auftrag nicht gefunden");
    const notes = job.notes ? `${job.notes}\n\n${text}` : text;
    const { error: e2 } = await sb.from("jobs").update({ notes }).eq("id", job_id);
    if (e2) throw new ToolError(e2.message);
    return { content: [{ type: "text", text: "Notiz ergänzt." }] };
  },
});
