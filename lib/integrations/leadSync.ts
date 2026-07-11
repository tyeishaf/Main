import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LEAD SYNC — one upsert path for every source.
 *
 * Two delivery modes, both landing in upsertLead():
 *  1. PUSH (preferred): /api/webhooks/leads receives POSTs from
 *     VanillaSoft, Textdrip, Zapier, Make, or any vendor. Instant,
 *     no polling, no manual downloads.
 *  2. PULL: pollSources() runs on cron for vendors that can't push.
 *     VanillaSoft/Textdrip API shapes vary by plan — the fetch stubs
 *     below are marked TODO with the exact spot to paste endpoints
 *     from their docs once your account tier is confirmed.
 */

export interface InboundLead {
  first_name?: string; last_name?: string;
  phone?: string; email?: string;
  address?: string; city?: string; state?: string; zip?: string;
  coverage_needed?: string; notes?: string;
  source: string;                 // "vanillasoft" | "textdrip" | "webhook:<name>"
  external_id?: string;
}

const normPhone = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10) || null;

export async function upsertLead(
  s: SupabaseClient, orgId: string, lead: InboundLead
): Promise<{ id: string; created: boolean }> {
  // Dedupe by phone, then email
  let existing: { id: string } | null = null;
  const phone = normPhone(lead.phone);
  if (phone) {
    const { data } = await s.from("contacts").select("id, phone").eq("org_id", orgId);
    existing = (data ?? []).find((c: any) => normPhone(c.phone) === phone) ?? null;
  }
  if (!existing && lead.email) {
    const { data } = await s.from("contacts")
      .select("id").eq("org_id", orgId).ilike("email", lead.email).maybeSingle();
    existing = data ?? null;
  }

  if (existing) {
    // Merge: fill blanks only
    const { data: cur } = await s.from("contacts")
      .select("email, phone, address, city, state, zip, coverage_needed")
      .eq("id", existing.id).single();
    const patch: Record<string, unknown> = {};
    for (const k of ["email", "phone", "address", "city", "state", "zip", "coverage_needed"] as const) {
      if (lead[k] && !(cur as any)?.[k]) patch[k] = lead[k];
    }
    if (Object.keys(patch).length) await s.from("contacts").update(patch).eq("id", existing.id);
    return { id: existing.id, created: false };
  }

  const { data: ins } = await s.from("contacts").insert({
    org_id: orgId,
    first_name: lead.first_name ?? "Unknown",
    last_name: lead.last_name ?? null,
    phone: lead.phone ?? null, email: lead.email ?? null,
    address: lead.address ?? null, city: lead.city ?? null,
    state: lead.state ?? null, zip: lead.zip ?? null,
    coverage_needed: lead.coverage_needed ?? null,
    notes: lead.notes ?? null,
    lead_source: lead.source,
    custom_fields: lead.external_id ? { external_id: lead.external_id } : {},
  }).select("id").single();

  const id = ins!.id;

  // New lead → default sequence, immediately (the "never lose a lead" moment)
  const { data: seq } = await s.from("sequences")
    .select("id").eq("org_id", orgId).eq("is_default", true).maybeSingle();
  if (seq) {
    await s.from("sequence_enrollments").insert({
      org_id: orgId, contact_id: id, sequence_id: seq.id,
      next_run_at: new Date().toISOString(),
    });
  }
  await s.from("activities").insert({
    org_id: orgId, contact_id: id, type: "system", direction: "internal",
    body: `New lead · Source: ${lead.source}`,
  });

  return { id, created: true };
}

/** Field-name translation for common vendor payload shapes. */
export function normalizePayload(raw: Record<string, any>, source: string): InboundLead {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(raw).find((rk) => rk.toLowerCase().replace(/[_\s]/g, "") === k);
      if (hit && raw[hit] != null && String(raw[hit]).trim() !== "") return String(raw[hit]).trim();
    }
    return undefined;
  };
  return {
    first_name: pick("firstname", "first", "fname"),
    last_name: pick("lastname", "last", "lname"),
    phone: pick("phone", "phonenumber", "mobile", "cell", "mobilephone"),
    email: pick("email", "emailaddress"),
    address: pick("address", "street", "address1"),
    city: pick("city"),
    state: pick("state", "st"),
    zip: pick("zip", "zipcode", "postalcode"),
    coverage_needed: pick("coverage", "coverageneeded", "productinterest", "product"),
    notes: pick("notes", "comments"),
    external_id: pick("id", "leadid", "contactid"),
    source,
  };
}

/** Cron-driven pull for vendors without webhooks on your plan. */
export async function pollSources(s: SupabaseClient, orgId: string): Promise<number> {
  let imported = 0;

  // ── VanillaSoft ──
  // TODO(Tyeisha): confirm API access on your VanillaSoft plan, then
  // paste the "list contacts created since" endpoint + auth here.
  if (process.env.VANILLASOFT_API_KEY && process.env.VANILLASOFT_API_URL) {
    try {
      const res = await fetch(process.env.VANILLASOFT_API_URL, {
        headers: { Authorization: `Bearer ${process.env.VANILLASOFT_API_KEY}` },
      });
      if (res.ok) {
        const rows: any[] = await res.json();
        for (const r of rows) {
          const { created } = await upsertLead(s, orgId, normalizePayload(r, "vanillasoft"));
          if (created) imported++;
        }
      }
    } catch (err) { console.error("vanillasoft poll", err); }
  }

  // ── Textdrip ──
  // TODO(Tyeisha): same — endpoint + auth per your Textdrip plan docs.
  if (process.env.TEXTDRIP_API_KEY && process.env.TEXTDRIP_API_URL) {
    try {
      const res = await fetch(process.env.TEXTDRIP_API_URL, {
        headers: { Authorization: `Bearer ${process.env.TEXTDRIP_API_KEY}` },
      });
      if (res.ok) {
        const rows: any[] = await res.json();
        for (const r of rows) {
          const { created } = await upsertLead(s, orgId, normalizePayload(r, "textdrip"));
          if (created) imported++;
        }
      }
    } catch (err) { console.error("textdrip poll", err); }
  }

  return imported;
}
