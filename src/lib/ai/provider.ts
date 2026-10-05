export type ChatPart = Record<string, unknown>;

export type AiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type CompleteChatInput = {
  system: string;
  userContent: string | ChatPart[];
  tools?: AiTool[];
  toolName?: string;
};

export type CompleteChatResult = {
  toolArguments: string | null;
  text: string | null;
};

type ProviderConfig = {
  url: string;
  key: string;
  model: string;
};

function resolveProvider(): ProviderConfig {
  const provider = (process.env["AI_PROVIDER"] ?? "lovable").toLowerCase();
  const model = process.env["AI_MODEL"] ?? "google/gemini-2.5-flash";

  if (provider === "lovable" || provider === "") {
    const key = process.env["LOVABLE_API_KEY"] || process.env["AI_API_KEY"];
    if (!key) throw new Error("KI-Dienst nicht konfiguriert");
    return { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key, model };
  }

  const key = process.env["AI_API_KEY"] || process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("KI-Dienst nicht konfiguriert");
  const url = process.env["AI_BASE_URL"] || "https://api.openai.com/v1/chat/completions";
  return { url, key, model: process.env["AI_MODEL"] ?? "gpt-4o-mini" };
}

export async function completeChat(input: CompleteChatInput): Promise<CompleteChatResult> {
  const cfg = resolveProvider();
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.userContent },
    ],
  };
  if (input.tools?.length && input.toolName) {
    body["tools"] = input.tools;
    body["tool_choice"] = { type: "function", function: { name: input.toolName } };
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Zu viele Anfragen – bitte kurz warten.");
  if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht.");
  if (!res.ok) throw new Error(`KI-Fehler (${res.status})`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const msg = json.choices?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments ?? null;
  const text = typeof msg?.content === "string" ? msg.content : null;
  return { toolArguments: args, text };
}
