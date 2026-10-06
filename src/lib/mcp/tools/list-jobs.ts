import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_jobs",
  title: "Aufträge auflisten",
  description: "List the signed-in user's jobs (Baustellen/Service), optionally filtered by text or type.",
  inputSchema: {
    search: z.string().max(100).optional().describe("Text in title"),
    job_type: z.enum(["project", "service"]).optional(),
    limit: z.number().int().min(1).max(100).default(30),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ search, job_type, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("jobs")
      .select("id,title,job_type,status,street,zip,city,customer_id,appointment_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (search) q = q.ilike("title", `%${search}%`);
    if (job_type) q = q.eq("job_type", job_type);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const jobs = (data ?? []).map((j) => ({ ...j }));
    return { content: [{ type: "text", text: JSON.stringify(jobs) }], structuredContent: { jobs } };
  },
});
