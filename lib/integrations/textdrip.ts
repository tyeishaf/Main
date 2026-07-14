import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Textdrip adapter — enrolls a contact into a Textdrip drip campaign (so
 * Textdrip's automation sends the texts from your Textdrip number) and
 * sends one-off texts. Config lives in the `textdrip_settings` table,
 * editable from the app's Settings page (env vars are a fallback).
 */

export interface TextdripConfig {
  apiKey?: string; campaignId?: string; endpoint?: string; sendEndpoint?: string;
}

export async function getTextdripConfig(s: SupabaseClient, orgId: string): Promise<TextdripConfig> {
  let row: any = null;
  try {
    const { data } = await s.from("textdrip_settings")
      .select("api_key, campaign_id, endpoint, send_endpoint").eq("org_id", orgId).maybeSingle();
    row = data;
  } catch { /* table may not exist yet */ }
  return {
    apiKey: row?.api_key || process.env.TEXTDRIP_API_KEY || undefined,
    campaignId: row?.campaign_id || process.env.TEXTDRIP_CAMPAIGN_ID || undefined,
    endpoint: row?.endpoint || process.env.TEXTDRIP_ENDPOINT || undefined,
    sendEndpoint: row?.send_endpoint || process.env.TEXTDRIP_SEND_ENDPOINT || undefined,
  };
}

export const canEnroll = (c: TextdripConfig) => Boolean(c.apiKey && c.campaignId && c.endpoint);
export const canSend = (c: TextdripConfig) => Boolean(c.apiKey && c.sendEndpoint);

/** E.164 for US numbers: +1XXXXXXXXXX */
function e164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  return d ? `+${d}` : null;
}

/** Send a single SMS through Textdrip (from your Textdrip number). */
export async function sendTextdripSMS(
  s: SupabaseClient, orgId: string, contactId: string, phone: string, message: string
): Promise<boolean> {
  const cfg = await getTextdripConfig(s, orgId);
  const to = e164(phone);
  if (!to || !canSend(cfg)) return false;
  try {
    const res = await fetch(cfg.sendEndpoint!, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message, api_key: cfg.apiKey }), cache: "no-store",
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
  } catch { return false; }
}

/** Add a contact to the configured Textdrip campaign. */
export async function enrollInTextdrip(
  s: SupabaseClient, orgId: string, contactId: string, phone: string, fullName: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getTextdripConfig(s, orgId);
  if (!canEnroll(cfg)) return { ok: false, error: "Textdrip isn't set up yet — add it in Settings." };
  const number = e164(phone);
  if (!number) return { ok: false, error: "No valid phone number" };
  try {
    const res = await fetch(cfg.endpoint!, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.apiKey, campaign_id: cfg.campaignId,
        phone_number: number, full_name: fullName,
      }), cache: "no-store",
    });
    const json: any = await res.json().catch(() => ({}));
    const ok = res.ok && json?.error !== true && json?.status !== false;
    await s.from("activities").insert({
      org_id: orgId, contact_id: contactId, type: "sms", direction: "outbound",
      outcome: ok ? "none" : "bounced",
      body: ok ? "Enrolled in Textdrip automation" : `Textdrip enroll failed: ${json?.message ?? res.status}`,
    });
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
