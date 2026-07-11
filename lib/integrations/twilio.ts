import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Twilio adapter (plain REST — no SDK dependency).
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 * Every send is logged twice: `messages` (delivery record) and
 * `activities` (the relationship timeline the AI reads).
 */

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

export async function sendSMS(
  s: SupabaseClient, orgId: string, contactId: string, to: string, body: string
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to.startsWith("+") ? to : `+1${to.replace(/\D/g, "")}`,
          From: process.env.TWILIO_FROM_NUMBER!,
          Body: body,
        }),
      }
    );
    const json: any = await res.json();
    const ok = res.ok && !json.error_code;

    const { data: act } = await s.from("activities").insert({
      org_id: orgId, contact_id: contactId, type: "sms",
      direction: "outbound", outcome: ok ? "none" : "bounced", body,
    }).select("id").single();

    await s.from("messages").insert({
      org_id: orgId, contact_id: contactId, activity_id: act?.id,
      channel: "sms", direction: "outbound",
      status: ok ? "sent" : "failed",
      provider: "twilio", provider_message_id: json.sid ?? null,
      to_address: to, from_address: process.env.TWILIO_FROM_NUMBER,
      body, sent_at: ok ? new Date().toISOString() : null,
    });

    return ok;
  } catch (err) {
    console.error("twilio send failed", err);
    return false;
  }
}
