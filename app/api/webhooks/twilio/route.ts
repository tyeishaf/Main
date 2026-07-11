import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import { pauseOnInbound } from "@/lib/engine/sequences";

/**
 * Inbound SMS from Twilio (form-encoded POST).
 * Logs the reply on the timeline, pauses any active sequence,
 * creates an urgent "Respond" task, bumps last_inbound_at.
 * Configure: Twilio number → Messaging → webhook = <app>/api/webhooks/twilio
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const body = String(form.get("Body") ?? "");
  const sid = String(form.get("MessageSid") ?? "");

  const s = admin();
  const digits = from.replace(/\D/g, "").slice(-10);

  // Match contact by last-10 phone digits
  const { data: contacts } = await s.from("contacts").select("id, org_id, phone");
  const contact = (contacts ?? []).find(
    (c: any) => (c.phone ?? "").replace(/\D/g, "").slice(-10) === digits
  );

  if (contact) {
    const { data: act } = await s.from("activities").insert({
      org_id: contact.org_id, contact_id: contact.id,
      type: "sms", direction: "inbound", outcome: "replied", body,
    }).select("id").single();
    await s.from("messages").insert({
      org_id: contact.org_id, contact_id: contact.id, activity_id: act?.id,
      channel: "sms", direction: "inbound", status: "received",
      provider: "twilio", provider_message_id: sid,
      from_address: from, body,
    });
    await pauseOnInbound(s, contact.org_id, contact.id);
  }

  // Empty TwiML = no auto-reply; YOU reply, personally.
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
}
