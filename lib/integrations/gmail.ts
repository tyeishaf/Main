import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gmail adapter — sends as YOUR Gmail so replies land in your inbox
 * and threads look human, not like marketing blasts.
 * Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM
 * (One-time OAuth consent walkthrough in SETUP.md.)
 */

export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_FROM
  );
}

async function accessToken(): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });
    const json: any = await res.json();
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export async function sendEmail(
  s: SupabaseClient, orgId: string, contactId: string,
  to: string, subject: string, body: string
): Promise<boolean> {
  const token = await accessToken();
  if (!token) return false;

  const raw = Buffer.from(
    `From: ${process.env.GMAIL_FROM}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString("base64url");

  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      }
    );
    const json: any = await res.json();
    const ok = res.ok;

    const { data: act } = await s.from("activities").insert({
      org_id: orgId, contact_id: contactId, type: "email",
      direction: "outbound", outcome: ok ? "none" : "bounced",
      subject, body,
    }).select("id").single();

    await s.from("messages").insert({
      org_id: orgId, contact_id: contactId, activity_id: act?.id,
      channel: "email", direction: "outbound",
      status: ok ? "sent" : "failed",
      provider: "gmail", provider_message_id: json.id ?? null,
      to_address: to, from_address: process.env.GMAIL_FROM,
      subject, body, sent_at: ok ? new Date().toISOString() : null,
    });

    return ok;
  } catch (err) {
    console.error("gmail send failed", err);
    return false;
  }
}
