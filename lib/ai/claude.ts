/**
 * Claude API client (plain fetch, no SDK).
 * Env: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL.
 * Server-only — never import from a client component.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function complete(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {}
): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 700,
        system: opts.system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("claude api", res.status, await res.text());
      return null;
    }
    const data: any = await res.json();
    return (data.content ?? [])
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim() || null;
  } catch (err) {
    console.error("claude api failed", err);
    return null;
  }
}

/** Ask for JSON only; strips fences; returns null on parse failure. */
export async function completeJson<T>(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {}
): Promise<T | null> {
  const sys = `${opts.system ?? ""}\nRespond with ONLY valid JSON. No preamble, no markdown fences.`.trim();
  const text = await complete(prompt, { ...opts, system: sys });
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim()) as T;
  } catch {
    return null;
  }
}
