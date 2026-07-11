import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "./claude";

/**
 * MORNING BRIEFING — runs after the task generators so it can see
 * the finished day plan. Writes two ai_outputs rows per org:
 *   daily_briefing  → the hero paragraph on the dashboard
 *   affirmation     → the day's mantra (prompt_version 'affirmation-v1')
 * The dashboard reads today's rows; if absent (key not set, job not
 * run yet), the template fallback in lib/data.ts still works.
 */

const SYSTEM = `You are the executive assistant for an independent licensed health insurance advisor.
You are warm, sharp, and brief. You know her book of business. You prioritize ruthlessly:
promises made to clients, expiring windows (birthdays, renewals, quotes), then the warmest leads.
Never invent facts not present in the data given.`;

export async function generateMorningBriefing(s: SupabaseClient, orgId: string): Promise<boolean> {
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  const [tasksQ, apptsQ, renewalsQ] = await Promise.all([
    s.from("tasks")
      .select("type, title, description, priority, contacts(first_name, last_name, lead_score)")
      .eq("org_id", orgId).eq("status", "open")
      .lte("due_at", dayEnd.toISOString()).order("due_at").limit(30),
    s.from("appointments")
      .select("title, starts_at").eq("org_id", orgId)
      .gte("starts_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .lte("starts_at", dayEnd.toISOString()),
    s.from("policies")
      .select("renewal_date, product_type, contacts(first_name, last_name)")
      .eq("org_id", orgId).eq("status", "active")
      .gte("renewal_date", new Date().toISOString().slice(0, 10))
      .lte("renewal_date", new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)),
  ]);

  const taskLines = (tasksQ.data ?? []).map((t: any) =>
    `- [${t.priority}] ${t.type}: ${t.title}${t.contacts ? ` (${t.contacts.first_name}, score ${t.contacts.lead_score})` : ""}${t.description ? ` — ${t.description}` : ""}`
  ).join("\n");
  const apptLines = (apptsQ.data ?? []).map((a: any) => `- ${a.title}`).join("\n") || "(none)";
  const renewalLines = (renewalsQ.data ?? []).map((p: any) =>
    `- ${p.contacts?.first_name ?? "client"} ${p.contacts?.last_name ?? ""}: ${p.product_type} renews ${p.renewal_date}`
  ).join("\n") || "(none)";

  const result = await completeJson<{ briefing: string; affirmation: string }>(
    `Today's open tasks:\n${taskLines || "(none)"}\n\nToday's appointments:\n${apptLines}\n\nRenewals in the next 30 days:\n${renewalLines}\n\nWrite JSON with two keys:
"briefing": a 2-4 sentence morning note to the advisor. First person is her ("You have..."). Summarize the day's shape with real counts and names from the data, then tell her exactly who to start with and why. Warm but efficient; no bullet points; no emojis.
"affirmation": one original, powerful daily affirmation (max 20 words) for a woman building an elite independent health insurance advisory. First person ("I..."). Confident, elegant, never cheesy corporate-speak.`,
    { system: SYSTEM, maxTokens: 500 }
  );

  if (!result?.briefing) return false;

  await s.from("ai_outputs").insert([
    { org_id: orgId, type: "daily_briefing", prompt_version: "briefing-v1", content: result.briefing },
    { org_id: orgId, type: "other", prompt_version: "affirmation-v1", content: result.affirmation ?? "" },
  ]);
  return true;
}
