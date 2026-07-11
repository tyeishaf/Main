import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MORNING GENERATORS — run once daily (6am cron). Idempotent:
 * each checks for an existing open task before creating one.
 * Phase 8 adds the Claude briefing on top of what these produce.
 */

async function taskExists(s: SupabaseClient, contactId: string, titleLike: string): Promise<boolean> {
  const { count } = await s.from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId).eq("status", "open").ilike("title", `%${titleLike}%`);
  return (count ?? 0) > 0;
}

/** Birthdays today (PHI table read happens server-side only). */
export async function generateBirthdayTasks(s: SupabaseClient): Promise<number> {
  const { data } = await s.rpc("contacts_with_birthday_today");
  let n = 0;
  for (const row of (data ?? []) as { contact_id: string; org_id: string; first_name: string }[]) {
    if (await taskExists(s, row.contact_id, "Birthday")) continue;
    await s.from("tasks").insert({
      org_id: row.org_id, contact_id: row.contact_id, type: "call",
      title: `Birthday — ${row.first_name}`,
      description: "A personal call beats a text for clients.",
      priority: "high", due_at: new Date().toISOString(), source: "automation",
    });
    n++;
  }
  return n;
}

/** Policies renewing within 30 days → schedule a review. */
export async function generateRenewalTasks(s: SupabaseClient): Promise<number> {
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await s.from("policies")
    .select("org_id, contact_id, renewal_date, product_type, contacts(first_name)")
    .eq("status", "active").gte("renewal_date", today).lte("renewal_date", soon);

  let n = 0;
  for (const p of (data ?? []) as any[]) {
    if (!p.contact_id || (await taskExists(s, p.contact_id, "Renewal"))) continue;
    await s.from("tasks").insert({
      org_id: p.org_id, contact_id: p.contact_id, type: "call",
      title: `Renewal review — ${p.contacts?.first_name ?? "client"}`,
      description: `${p.product_type} renews ${p.renewal_date}. Annual review = retention + upsell moment.`,
      priority: "high", due_at: new Date().toISOString(), source: "automation",
    });
    n++;
  }
  return n;
}

/** Active leads with no touch in 9+ days and no open task → rescue them. */
export async function generateColdLeadTasks(s: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const { data } = await s.from("contacts")
    .select("id, org_id, first_name, last_contact_at, dispositions:current_disposition_id(is_terminal)")
    .eq("lifecycle", "lead").lt("last_contact_at", cutoff).limit(100);

  let n = 0;
  for (const c of (data ?? []) as any[]) {
    if (c.dispositions?.is_terminal) continue;
    const { count } = await s.from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", c.id).eq("status", "open");
    if ((count ?? 0) > 0) continue;
    await s.from("tasks").insert({
      org_id: c.org_id, contact_id: c.id, type: "call",
      title: `Going cold — ${c.first_name}`,
      description: "No contact in 9+ days and nothing scheduled. Rescue or disposition out.",
      priority: "normal", due_at: new Date().toISOString(), source: "automation",
    });
    n++;
  }
  return n;
}
