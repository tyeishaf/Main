import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "./claude";

/**
 * LEAD SCORING — nightly, explainable.
 * score = deterministic base (0–70) + Claude qualitative signal (−15..+30),
 * clamped 0–100. Both halves and their reasons land in score_reasons,
 * so "why is Marisol an 86?" always has an answer.
 */

function baseScore(c: any): { pts: number; reasons: string[] } {
  let pts = 20; // pulse
  const reasons: string[] = [];

  const daysSinceInbound = c.last_inbound_at
    ? (Date.now() - new Date(c.last_inbound_at).getTime()) / 86_400_000
    : null;
  if (daysSinceInbound !== null && daysSinceInbound <= 3) { pts += 20; reasons.push("replied in the last 3 days"); }
  else if (daysSinceInbound !== null && daysSinceInbound <= 10) { pts += 10; reasons.push("replied recently"); }

  if (c.budget_monthly) { pts += 10; reasons.push("shared a budget"); }
  if (c.phone && c.email) { pts += 5; reasons.push("full contact info"); }
  if ((c.coverage_type ?? []).includes("group")) { pts += 10; reasons.push("group business (high value)"); }
  else if ((c.coverage_type ?? []).includes("family")) { pts += 7; reasons.push("family coverage (high value)"); }
  if (c.lead_source === "Referral") { pts += 8; reasons.push("referral source closes well"); }

  const daysSinceContact = c.last_contact_at
    ? (Date.now() - new Date(c.last_contact_at).getTime()) / 86_400_000
    : 99;
  if (daysSinceContact > 14) { pts -= 10; reasons.push("stale: no touch in 14+ days"); }

  return { pts: Math.max(0, Math.min(70, pts)), reasons };
}

export async function scoreLeads(s: SupabaseClient, orgId: string, batch = 20): Promise<number> {
  const { data: leads } = await s.from("contacts")
    .select("id, first_name, coverage_type, budget_monthly, lead_source, phone, email, last_contact_at, last_inbound_at, lead_score")
    .eq("org_id", orgId).eq("lifecycle", "lead")
    .order("updated_at", { ascending: false })
    .limit(batch);

  let scored = 0;
  for (const c of leads ?? []) {
    const base = baseScore(c);

    // Qualitative: Claude reads the recent timeline for buying signals
    const { data: acts } = await s.from("activities")
      .select("type, direction, outcome, body, occurred_at")
      .eq("contact_id", c.id).order("occurred_at", { ascending: false }).limit(10);
    const timeline = (acts ?? [])
      .map((a: any) => `${a.type}/${a.direction}${a.outcome !== "none" ? `/${a.outcome}` : ""}: ${(a.body ?? "").slice(0, 150)}`)
      .join("\n");

    let adj = 0;
    let adjReason = "no AI signal";
    if (timeline) {
      const r = await completeJson<{ adjustment: number; reason: string }>(
        `Recent interaction history for a health-insurance lead:\n${timeline}\n\nReturn JSON: {"adjustment": integer between -15 and 30, "reason": "one short sentence"}.
Positive: urgency (life events, coverage gap, deadline), engagement, specific questions about plans/prices, scheduling behavior.
Negative: brush-offs, "already covered", long silence after quotes.`,
        { maxTokens: 150 }
      );
      if (r && Number.isFinite(r.adjustment)) {
        adj = Math.max(-15, Math.min(30, Math.round(r.adjustment)));
        adjReason = r.reason ?? adjReason;
      }
    }

    const score = Math.max(0, Math.min(100, base.pts + adj + 15)); // +15 recenters vs old scale
    await s.from("contacts").update({
      lead_score: score,
      close_probability: Number((score / 100).toFixed(3)),
      score_reasons: { base: base.pts, base_reasons: base.reasons, ai_adjustment: adj, ai_reason: adjReason, scored_at: new Date().toISOString() },
    }).eq("id", c.id);
    scored++;
  }
  return scored;
}
