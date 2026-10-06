import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "Kunden auflisten",
  description: "List the signed-in user's customers, optionally filtered by name or company.",
  inputSchema: {
    search: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(100).default(30),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("customers")
      .select("id,company_name,first_name,last_name,street,zip,city,phone,email")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (search) {
      const s = search.replace(/[,()%]/g, " ");
      q = q.or(`company_name.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const customers = (data ?? []).map((c) => ({ ...c }));
    return { content: [{ type: "text", text: JSON.stringify(customers) }], structuredContent: { customers } };
  },
});
