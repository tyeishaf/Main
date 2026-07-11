import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CONTEXT PACK — the bounded slice of a relationship Claude sees.
 * PHI (contact_health_profiles: DOB, income, conditions) is NEVER
 * included. If a future feature needs it, that becomes an explicit,
 * audited, per-request opt-in — not a default.
 */

export interface ContactContext {
  header: string;
  timeline: string;
  openTasks: string;
}

export async function buildContactContext(
  s: SupabaseClient, orgId: string, contactId: string
): Promise<ContactContext | null> {
  const [contactQ, actsQ, tasksQ] = await Promise.all([
    s.from("contacts")
      .select("first_name, last_name, city, state, coverage_type, coverage_needed, budget_monthly, lead_source, lead_score, lifecycle, notes, last_contact_at, dispositions:current_disposition_id(name)")
      .eq("org_id", orgId).eq("id", contactId).single(),
    s.from("activities")
      .select("type, direction, outcome, subject, body, occurred_at")
      .eq("org_id", orgId).eq("contact_id", contactId)
      .order("occurred_at", { ascending: false }).limit(15),
    s.from("tasks")
      .select("type, title, due_at, priority")
      .eq("org_id", orgId).eq("contact_id", contactId).eq("status", "open"),
  ]);

  const c: any = contactQ.data;
  if (!c) return null;

  const header = [
    `Name: ${c.first_name} ${c.last_name ?? ""}`.trim(),
    `Stage: ${c.lifecycle} · Disposition: ${c.dispositions?.name ?? "New Lead"}`,
    c.city || c.state ? `Location: ${[c.city, c.state].filter(Boolean).join(", ")}` : null,
    c.coverage_type?.length ? `Interested in: ${c.coverage_type.join(", ")}` : null,
    c.coverage_needed ? `Coverage needed: ${c.coverage_needed}` : null,
    c.budget_monthly ? `Budget: ~$${c.budget_monthly}/mo` : null,
    `Source: ${c.lead_source ?? "unknown"} · Lead score: ${c.lead_score}`,
    c.notes ? `Notes: ${c.notes}` : null,
  ].filter(Boolean).join("\n");

  const timeline = (actsQ.data ?? [])
    .map((a: any) => {
      const when = new Date(a.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `[${when}] ${a.type} ${a.direction}${a.outcome && a.outcome !== "none" ? ` (${a.outcome})` : ""}: ${(a.subject ? a.subject + " — " : "") + (a.body ?? "")}`.slice(0, 220);
    })
    .join("\n") || "(no history yet)";

  const openTasks = (tasksQ.data ?? [])
    .map((t: any) => `- [${t.priority}] ${t.type}: ${t.title}`)
    .join("\n") || "(none)";

  return { header, timeline, openTasks };
}

/** Up to 3 samples of the agent's own edited messages → tone grounding. */
export async function toneSamples(s: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await s.from("ai_outputs")
    .select("edited_content, content, approved")
    .eq("org_id", orgId)
    .in("type", ["draft_sms", "draft_email"])
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(3);
  const samples = (data ?? [])
    .map((d: any) => d.edited_content ?? d.content)
    .filter(Boolean);
  return samples.length
    ? `Examples of how this agent actually writes (match this voice):\n${samples.map((x: string, i: number) => `${i + 1}. ${x}`).join("\n")}`
    : "";
}
