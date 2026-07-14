import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Textdrip adapter — enrolls a contact into a Textdrip drip campaign so
 * Textdrip's automation sends the texts (from your Textdrip number), not
 * your personal phone.
 *
 * Env:
 *   TEXTDRIP_API_KEY       your Textdrip API token
 *   TEXTDRIP_CAMPAIGN_ID   the automation/campaign new contacts drop into
 *   TEXTDRIP_ENDPOINT       "add contact to campaign" URL
 *                           (payload: { api_key, campaign_id, phone_number, full_name })
 *   TEXTDRIP_SEND_ENDPOINT  "send single SMS" URL
 *                           (payload: { to, message, api_key })
 */

/** Can we enroll contacts into a Textdrip automation? */
export function textdripConfigured(): boolean {
  return Boolean(
    process.env.TEXTDRIP_API_KEY &&
    process.env.TEXTDRIP_CAMPAIGN_ID &&
    process.env.TEXTDRIP_ENDPOINT
  );
}

/** Can we send a one-off SMS through Textdrip? */
export function textdripSendConfigured(): boolean {
  return Boolean(process.env.TEXTDRIP_API_KEY && process.env.TEXTDRIP_SEND_ENDPOINT);
}

/** E.164 for US numbers: +1XXXXXXXXXX */
function e164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  return d ? `+${d}` : null;
}

/** Send a single SMS through Textdrip (from your Textdrip number). */
export async function sendTextdripSMS(
  s: SupabaseClient, orgId: string, contactId: string,
  phone: string, message: string
): Promise<boolean> {
  const to = e164(phone);
  if (!to || !textdripSendConfigured()) return false;
  try {
    const res = await fetch(process.env.TEXTDRIP_SEND_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message, api_key: process.env.TEXTDRIP_API_KEY }),
      cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = res.ok && json?.error !== true && json?.status !== false;
    const { data: act } = await s.from("activities").insert({
      org_id: orgId, contact_id: contactId, type: "sms",
      direction: "outbound", outcome: ok ? "none" : "bounced", body: message,
    }).select("id").single();
    await s.from("messages").insert({
      org_id: orgId, contact_id: contactId, activity_id: act?.id,
      channel: "sms", direction: "outbound", status: ok ? "sent" : "failed",
      provider: "textdrip", to_address: to, body: message,
      sent_at: ok ? new Date().toISOString() : null,
    });
    return ok;
  } catch {
    return false;
  }
}

/** Add a contact to the configured Textdrip campaign. */
export async function enrollInTextdrip(
  s: SupabaseClient, orgId: string, contactId: string,
  phone: string, fullName: string
): Promise<{ ok: boolean; error?: string }> {
  const number = e164(phone);
  if (!number) return { ok: false, error: "No valid phone number" };

  try {
    const res = await fetch(process.env.TEXTDRIP_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TEXTDRIP_API_KEY,
        campaign_id: process.env.TEXTDRIP_CAMPAIGN_ID,
        phone_number: number,
        full_name: fullName,
      }),
      cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = res.ok && json?.error !== true && json?.status !== false;

    await s.from("activities").insert({
      org_id: orgId, contact_id: contactId, type: "sms",
      direction: "outbound", outcome: ok ? "none" : "bounced",
      body: ok ? "Enrolled in Textdrip automation" : `Textdrip enroll failed: ${json?.message ?? res.status}`,
    });

    // pause the in-app sequence — Textdrip is driving outreach now
    if (ok) {
      await s.from("sequence_enrollments")
        .update({ status: "paused", paused_reason: "textdrip", next_run_at: null })
        .eq("contact_id", contactId).eq("status", "active");
    }
    return ok ? { ok: true } : { ok: false, error: json?.message ?? `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error" };
  }
}
