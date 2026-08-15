/**
 * Single AI entry point for the whole tool.
 *
 * Provider order:
 *   1. OPENAI_API_KEY  → api.openai.com (your own billing, works with zero
 *                        Lovable credits — this is the autonomous fallback)
 *   2. LOVABLE_API_KEY → Lovable AI Gateway (uses workspace credits)
 *
 * Everything (copy, style plans, clip vision tagging) routes through here, so
 * dropping an OpenAI key into the project secrets is enough to keep autopilot
 * running forever without Lovable credits.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiMessage = { role: "system" | "user" | "assistant"; content: any };

export function aiProvider(): "openai" | "lovable" | null {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.LOVABLE_API_KEY) return "lovable";
  return null;
}

export function aiAvailable() {
  return aiProvider() !== null;
}

/**
 * Chat completion that always returns parsed JSON (or null on any failure).
 * `lovableModel` lets each call site keep its previous gateway model.
 */
export async function aiJSON(opts: {
  messages: AiMessage[];
  temperature?: number;
  lovableModel?: string;
}): Promise<unknown | null> {
  const provider = aiProvider();
  if (!provider) return null;

  const url =
    provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "openai") headers["Authorization"] = `Bearer ${process.env.OPENAI_API_KEY}`;
  else headers["Lovable-API-Key"] = process.env.LOVABLE_API_KEY!;

  const model =
    provider === "openai"
      ? (process.env.OPENAI_MODEL || "gpt-4o-mini")
      : (opts.lovableModel || "google/gemini-3-flash-preview");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.9,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error(`AI ${provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) {
    console.error("AI request failed", e instanceof Error ? e.message : String(e));
    return null;
  }
}
