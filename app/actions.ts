"use server";

import { revalidatePath } from "next/cache";
import { ctx, hasSupabase } from "@/lib/supabase";
import { advance } from "@/lib/engine/sequences";

/**
 * Server actions — Phase 5.
 * Every mutation writes the operational record AND the story:
 * an `activities` row so the timeline (and later the AI) sees it.
 */

export async function setDisposition(contactId: string, name: string) {
  if (!hasSupabase()) return { ok: true, offline: true };
  const { s, orgId } = await ctx();

  const { data: d } = await s
    .from("dispositions")
    .select("id, pauses_sequences, is_terminal")
    .eq("org_id", orgId).eq("name", name).single();
  if (!d) return { ok: false, error: "Unknown disposition" };

  await Promise.all([
    s.from("contacts").update({ current_disposition_id: d.id }).eq("id", contactId).eq("org_id", orgId),
    s.from("disposition_history").insert({ org_id: orgId, contact_id: contactId, disposition_id: d.id }),
    s.from("activities").insert({
      org_id: orgId, contact_id: contactId,
      type: "disposition_change", direction: "internal",
      body: `Disposition changed to "${name}"${d.pauses_sequences ? " — follow-up sequence paused" : ""}`,
    }),
  ]);

  // Sequence guardrails: terminal/pausing dispositions stop automation
  if (d.pauses_sequences) {
    await s.from("sequence_enrollments")
      .update({ status: "paused", paused_reason: `disposition: ${name}` })
      .eq("contact_id", contactId).eq("status", "active");
  }

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function completeTask(taskId: string, outcome: string = "completed") {
  if (!hasSupabase()) return { ok: true, offline: true };
  const { s, orgId } = await ctx();
  const { data: t } = await s.from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), outcome })
    .eq("id", taskId).eq("org_id", orgId)
    .select("contact_id, title, enrollment_id").single();

  // Feed the sequence engine: outcomes drive branching
  if (t?.enrollment_id) await advance(s, t.enrollment_id, outcome);
  if (t?.contact_id) {
    await s.from("activities").insert({
      org_id: orgId, contact_id: t.contact_id,
      type: "task_completed", direction: "internal", body: `Completed: ${t.title}`,
    });
  }
  revalidatePath("/");
  return { ok: true };
}

// ── CSV import ──────────────────────────────────────────────

/** Minimal RFC-4180-ish parser: handles quoted fields and commas inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** Header → contacts column auto-mapping. Extend freely. */
const HEADER_MAP: Record<string, string> = {
  "first name": "first_name", firstname: "first_name", first: "first_name",
  "last name": "last_name", lastname: "last_name", last: "last_name",
  phone: "phone", "phone number": "phone", mobile: "phone", cell: "phone",
  email: "email", "email address": "email",
  address: "address", city: "city", state: "state", st: "state",
  zip: "zip", "zip code": "zip", zipcode: "zip",
  occupation: "occupation", "business name": "business_name",
  "product interest": "coverage_needed", "coverage needed": "coverage_needed",
  budget: "budget_monthly", income: "income", notes: "notes",
};

const normPhone = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10) || null;

export async function importLeads(csvText: string, sourceLabel: string, enroll: boolean) {
  if (!hasSupabase()) return { ok: true, offline: true, created: 0, merged: 0, enrolled: 0 };
  const { s, orgId } = await ctx();

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false, error: "No data rows found" };

  const headers = rows[0].map((h) => HEADER_MAP[h.trim().toLowerCase()] ?? null);
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && r[i]?.trim()) rec[h] = r[i].trim(); });
    return rec;
  }).filter((r) => r.first_name || r.phone || r.email);

  // Dedupe against existing contacts by normalized phone / lowercase email
  const { data: existing } = await s.from("contacts")
    .select("id, phone, email").eq("org_id", orgId);
  const byPhone = new Map((existing ?? []).map((c: any) => [normPhone(c.phone), c.id]));
  const byEmail = new Map((existing ?? []).map((c: any) => [(c.email ?? "").toLowerCase(), c.id]));

  let created = 0, merged = 0;
  const newIds: string[] = [];

  for (const r of records) {
    const matchId = byPhone.get(normPhone(r.phone)) ?? byEmail.get((r.email ?? "").toLowerCase());
    if (matchId) {
      // Merge: fill blank fields only — never overwrite existing data
      const { data: cur } = await s.from("contacts")
        .select("email, phone, address, city, state, zip, occupation")
        .eq("id", matchId).single();
      const patch: Record<string, unknown> = {};
      for (const k of ["email", "phone", "address", "city", "state", "zip", "occupation"] as const) {
        if (r[k] && !(cur as any)?.[k]) patch[k] = r[k];
      }
      if (Object.keys(patch).length) {
        await s.from("contacts").update(patch).eq("id", matchId);
      }
      merged++;
      continue;
    }
    const { data: ins } = await s.from("contacts").insert({
      org_id: orgId,
      first_name: r.first_name ?? "Unknown",
      last_name: r.last_name ?? null,
      phone: r.phone ?? null, email: r.email ?? null,
      address: r.address ?? null, city: r.city ?? null, state: r.state ?? null, zip: r.zip ?? null,
      coverage_needed: r.coverage_needed ?? null,
      budget_monthly: r.budget_monthly ? Number(r.budget_monthly.replace(/[^0-9.]/g, "")) || null : null,
      notes: r.notes ?? null,
      lead_source: sourceLabel || "CSV import",
    }).select("id").single();
    if (ins) { created++; newIds.push(ins.id); }
  }

  // Auto-enroll in the default sequence → Phase 7 engine materializes Day-1 tasks
  let enrolled = 0;
  if (enroll && newIds.length) {
    const { data: seq } = await s.from("sequences")
      .select("id").eq("org_id", orgId).eq("is_default", true).maybeSingle();
    if (seq) {
      await s.from("sequence_enrollments").insert(
        newIds.map((id) => ({ org_id: orgId, contact_id: id, sequence_id: seq.id, next_run_at: new Date().toISOString() }))
      );
      enrolled = newIds.length;
    } else {
      // No sequence defined yet: create Day-1 call tasks directly so nothing slips
      await s.from("tasks").insert(
        newIds.map((id) => ({
          org_id: orgId, contact_id: id, type: "call",
          title: "Day 1 — first call", priority: "high",
          due_at: new Date().toISOString(), source: "automation",
        }))
      );
      enrolled = newIds.length;
    }
  }

  revalidatePath("/");
  return { ok: true, created, merged, enrolled };
}

export async function signOut() {
  if (!hasSupabase()) return;
  const { s } = await ctx();
  await s.auth.signOut();
}

// ── Phase 8: AI assistant actions ───────────────────────────

import { complete, aiConfigured } from "@/lib/ai/claude";
import { buildContactContext, toneSamples } from "@/lib/ai/context";
import { sendSMS, twilioConfigured } from "@/lib/integrations/twilio";
import { sendEmail, gmailConfigured } from "@/lib/integrations/gmail";
import { mockDraftMessage } from "@/lib/mock";

const DRAFT_SYSTEM = `You write outreach messages FOR a licensed independent health insurance advisor, in her voice.
Rules: warm, personal, specific to this lead's actual situation; one clear next step; never pushy;
never invent plan details, prices, or facts not in the context; no compliance-risky promises ("guaranteed", "best price").
Texts: under 300 characters. Emails: under 120 words, plain text. Return ONLY the message body.`;

export async function generateDraft(contactId: string, channel: "text" | "email") {
  if (!hasSupabase()) {
    return { id: null, content: await mockDraftMessage("there"), ai: false };
  }
  const { s, orgId } = await ctx();
  const pack = await buildContactContext(s, orgId, contactId);
  if (!pack) return { id: null, content: "", ai: false };

  let content: string | null = null;
  if (aiConfigured()) {
    const tone = await toneSamples(s, orgId);
    content = await complete(
      `${pack.header}\n\nRecent timeline (newest first):\n${pack.timeline}\n\nOpen tasks:\n${pack.openTasks}\n\n${tone}\n\nWrite the next ${channel === "text" ? "text message" : "email"} to this lead.`,
      { system: DRAFT_SYSTEM, maxTokens: 350 }
    );
  }
  const ai = Boolean(content);
  if (!content) content = await mockDraftMessage(pack.header.split("Name: ")[1]?.split("\n")[0] ?? "there");

  const { data: row } = await s.from("ai_outputs").insert({
    org_id: orgId, contact_id: contactId,
    type: channel === "text" ? "draft_sms" : "draft_email",
    prompt_version: "draft-v1", content,
  }).select("id").single();

  return { id: row?.id ?? null, content, ai };
}

/**
 * Approve a draft: records the decision (edited text feeds the tone
 * profile), then actually sends it if the channel is connected.
 */
export async function approveDraft(
  draftId: string | null, contactId: string,
  channel: "text" | "email", finalText: string, edited: boolean
) {
  if (!hasSupabase()) return { ok: true, sent: false };
  const { s, orgId } = await ctx();

  if (draftId) {
    await s.from("ai_outputs").update({
      approved: true,
      edited_content: edited ? finalText : null,
    }).eq("id", draftId).eq("org_id", orgId);
  }

  const { data: c } = await s.from("contacts")
    .select("phone, email").eq("id", contactId).eq("org_id", orgId).single();

  let sent = false;
  if (channel === "text" && twilioConfigured() && c?.phone) {
    sent = await sendSMS(s, orgId, contactId, c.phone, finalText);
  } else if (channel === "email" && gmailConfigured() && c?.email) {
    sent = await sendEmail(s, orgId, contactId, c.email, "Following up", finalText);
  }

  if (!sent) {
    // Not connected: still log the approved message so the timeline is honest
    await s.from("activities").insert({
      org_id: orgId, contact_id: contactId,
      type: channel === "text" ? "sms" : "email",
      direction: "outbound", body: `[approved draft — send manually] ${finalText}`,
    });
  }

  // A human just reached out — pause automation until they respond
  await s.from("sequence_enrollments")
    .update({ status: "paused", paused_reason: "manual_outreach", next_run_at: null })
    .eq("contact_id", contactId).eq("status", "active");

  revalidatePath("/");
  return { ok: true, sent };
}

export async function summarizeContact(contactId: string) {
  if (!hasSupabase()) return { ok: false, text: "" };
  const { s, orgId } = await ctx();
  const pack = await buildContactContext(s, orgId, contactId);
  if (!pack) return { ok: false, text: "" };

  const text = await complete(
    `${pack.header}\n\nTimeline (newest first):\n${pack.timeline}\n\nOpen tasks:\n${pack.openTasks}\n\nWrite a 2-3 sentence relationship summary for the advisor: where this lead stands, what they care about, and the single best next move. No preamble.`,
    { system: "You are a sharp CRM assistant for a health insurance advisor. Only use facts present in the context.", maxTokens: 250 }
  );
  if (!text) return { ok: false, text: "" };

  await s.from("activities").insert({
    org_id: orgId, contact_id: contactId,
    type: "ai_summary", direction: "internal", body: text,
  });
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, text };
}
