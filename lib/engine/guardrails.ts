import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GUARDRAILS — every automated outbound passes through here.
 * Rules, in order of severity:
 *  1. Do Not Contact / terminal disposition → hard stop, exit sequence.
 *  2. Quiet hours (contact's local evening/morning) → defer, don't drop.
 *  3. Frequency cap: max 1 automated message per contact per 20h → defer.
 */

export type GuardrailVerdict =
  | { ok: true }
  | { ok: false; reason: "dnc" | "quiet_hours" | "frequency"; deferUntil?: Date };

const QUIET_START = 20; // 8pm  — Phase: read from profiles.quiet_hours_*
const QUIET_END = 9;    // 9am

export function nextAllowedTime(now = new Date()): Date {
  const h = now.getHours();
  if (h >= QUIET_END && h < QUIET_START) return now;
  const next = new Date(now);
  if (h >= QUIET_START) next.setDate(next.getDate() + 1);
  next.setHours(QUIET_END, 5, 0, 0);
  return next;
}

export async function checkGuardrails(
  s: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<GuardrailVerdict> {
  // 1. DNC / terminal disposition
  const { data: c } = await s
    .from("contacts")
    .select("lifecycle, dispositions:current_disposition_id(name, is_terminal)")
    .eq("id", contactId).eq("org_id", orgId).single();
  const dispo: any = (c as any)?.dispositions;
  if ((c as any)?.lifecycle === "do_not_contact" || dispo?.name === "Do Not Contact" || dispo?.is_terminal) {
    return { ok: false, reason: "dnc" };
  }

  // 2. Quiet hours
  const now = new Date();
  const allowed = nextAllowedTime(now);
  if (allowed.getTime() > now.getTime()) {
    return { ok: false, reason: "quiet_hours", deferUntil: allowed };
  }

  // 3. Frequency cap — one automated outbound per 20h
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { count } = await s
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("contact_id", contactId)
    .eq("direction", "outbound").gte("created_at", since);
  if ((count ?? 0) >= 1) {
    return { ok: false, reason: "frequency", deferUntil: new Date(Date.now() + 6 * 3600_000) };
  }

  return { ok: true };
}
