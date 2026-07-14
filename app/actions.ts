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

  // A sale outcome promotes the lead to a client; a hard "no" lapses them.
  const CLIENT_DISPOSITIONS = new Set(["Policy Issued", "Application Submitted", "Application Started", "Existing Client", "Renewal", "Win Back"]);
  const LAPSED_DISPOSITIONS = new Set(["Do Not Contact", "Dead Lead", "DNQ", "Lost Sale", "Wrong Number"]);
  const lifecycle = CLIENT_DISPOSITIONS.has(name) ? "client"
    : name === "Do Not Contact" ? "do_not_contact"
    : LAPSED_DISPOSITIONS.has(name) ? "lapsed"
    : null;

  const contactUpdate: Record<string, unknown> = { current_disposition_id: d.id };
  if (lifecycle) contactUpdate.lifecycle = lifecycle;

  await Promise.all([
    s.from("contacts").update(contactUpdate).eq("id", contactId).eq("org_id", orgId),
    s.from("disposition_history").insert({ org_id: orgId, contact_id: contactId, disposition_id: d.id }),
    s.from("activities").insert({
      org_id: orgId, contact_id: contactId,
      type: "disposition_change", direction: "internal",
      body: `Disposition changed to "${name}"`
        + (lifecycle === "client" ? " — moved to Clients" : "")
        + (d.pauses_sequences ? " — follow-up sequence paused" : ""),
    }),
  ]);

  // Sequence guardrails: terminal/pausing dispositions stop automation
  if (d.pauses_sequences) {
    await s.from("sequence_enrollments")
      .update({ status: "paused", paused_reason: `disposition: ${name}` })
      .eq("contact_id", contactId).eq("status", "active");
  }

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/clients");
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
  "first name": "first_name", firstname: "first_name", first: "first_name", "given name": "first_name", fname: "first_name",
  "last name": "last_name", lastname: "last_name", last: "last_name", surname: "last_name", lname: "last_name",
  // primary phone — many vendors label it "Phone 1"
  phone: "phone", "phone number": "phone", "phone 1": "phone", phone1: "phone", "primary phone": "phone",
  mobile: "phone", "mobile phone": "phone", cell: "phone", "cell phone": "phone", telephone: "phone", "home phone": "phone",
  // secondary phone
  "phone 2": "phone_alt", phone2: "phone_alt", "secondary phone": "phone_alt", "alt phone": "phone_alt", "alternate phone": "phone_alt",
  email: "email", "email address": "email", "e-mail": "email", "e mail": "email",
  address: "address", "street address": "address", address1: "address", "address 1": "address", street: "address",
  city: "city", town: "city",
  // state — vendors often use "Region"
  state: "state", st: "state", region: "state", province: "state",
  // zip — vendors often use "Postal Code"
  zip: "zip", "zip code": "zip", zipcode: "zip", "postal code": "zip", postal: "zip", postcode: "zip",
  "date of birth": "dob", dob: "dob", birthdate: "dob", "birth date": "dob", birthday: "dob",
  "crm result": "import_status", "crm status": "import_status", disposition: "import_status", "lead status": "import_status",
  occupation: "occupation", "business name": "business_name", company: "business_name",
  "product interest": "coverage_needed", "coverage needed": "coverage_needed", coverage: "coverage_needed", "product type": "coverage_needed",
  budget: "budget_monthly", notes: "notes", note: "notes", comments: "notes",
  tier: "tier", "lead tier": "tier", source: "tier",
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
      phone: r.phone ?? null, phone_alt: r.phone_alt ?? null, email: r.email ?? null,
      address: r.address ?? null, city: r.city ?? null,
      state: r.state ?? null, zip: r.zip ?? null,
      coverage_needed: r.coverage_needed ?? null,
      date_of_birth: r.dob ? toDate(r.dob) : null,
      client_type: r.business_name ? "business" : "individual",
      import_status: r.import_status ?? null,
      budget_monthly: r.budget_monthly ? Number(r.budget_monthly.replace(/[^0-9.]/g, "")) || null : null,
      notes: r.notes ?? null,
      lead_source: r.tier ? `${sourceLabel || "CSV"} · ${r.tier}` : (sourceLabel || "CSV import"),
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

// ── Phase 9: quick-add contact & profile ────────────────────

export interface NewContactInput {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  coverageNeeded?: string;
  notes?: string;
}

export async function addContact(input: NewContactInput, enroll: boolean) {
  if (!hasSupabase()) return { ok: true as const, offline: true, id: null };
  const { s, orgId } = await ctx();

  const firstName = input.firstName.trim();
  if (!firstName) return { ok: false as const, error: "First name is required" };
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;

  // Same dedupe rule as CSV import: normalized phone or lowercase email wins
  if (phone || email) {
    const { data: existing } = await s.from("contacts")
      .select("id, phone, email").eq("org_id", orgId);
    const match = (existing ?? []).find((c: any) =>
      (phone && normPhone(c.phone) === normPhone(phone)) ||
      (email && (c.email ?? "").toLowerCase() === email)
    );
    if (match) return { ok: false as const, error: "Already in your book", id: match.id };
  }

  const { data: ins, error } = await s.from("contacts").insert({
    org_id: orgId,
    first_name: firstName,
    last_name: input.lastName?.trim() || null,
    phone, email,
    coverage_needed: input.coverageNeeded?.trim() || null,
    notes: input.notes?.trim() || null,
    lead_source: "manual",
  }).select("id").single();
  if (error || !ins) return { ok: false as const, error: error?.message ?? "Could not save" };

  await s.from("activities").insert({
    org_id: orgId, contact_id: ins.id,
    type: "system", direction: "internal", body: "Added manually",
  });

  if (enroll) {
    const { data: seq } = await s.from("sequences")
      .select("id").eq("org_id", orgId).eq("is_default", true).maybeSingle();
    if (seq) {
      await s.from("sequence_enrollments").insert({
        org_id: orgId, contact_id: ins.id, sequence_id: seq.id,
        next_run_at: new Date().toISOString(),
      });
    } else {
      await s.from("tasks").insert({
        org_id: orgId, contact_id: ins.id, type: "call",
        title: "Day 1 — first call", priority: "high",
        due_at: new Date().toISOString(), source: "automation",
      });
    }
  }

  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true as const, offline: false, id: ins.id };
}

export async function logCall(contactId: string, outcome: string, note?: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const now = new Date().toISOString();
  const label = note?.trim() ? `Call — ${outcome}: ${note.trim()}` : `Call — ${outcome}`;
  const { error } = await s.from("activities").insert({
    org_id: orgId, contact_id: contactId, type: "call",
    direction: "outbound", outcome: OUTCOME_MAP[outcome] ?? "none", body: label,
  });
  if (error) return { ok: false as const, error: error.message };
  // freshen last-contact so the lead stops looking "cold"
  await s.from("contacts").update({ last_contact_at: now })
    .eq("id", contactId).eq("org_id", orgId);
  revalidatePath(`/contacts/${contactId}`); revalidatePath("/");
  return { ok: true as const, offline: false };
}

const OUTCOME_MAP: Record<string, string> = {
  Connected: "connected", Voicemail: "voicemail", "No answer": "no_answer",
  Busy: "busy", "Wrong number": "wrong_number", "Not interested": "none",
};

export async function setClientType(contactId: string, type: "individual" | "business") {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const { error } = await s.from("contacts")
    .update({ client_type: type === "business" ? "business" : "individual" })
    .eq("id", contactId).eq("org_id", orgId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/contacts/${contactId}`); revalidatePath("/clients");
  return { ok: true as const, offline: false };
}

export async function saveContactDob(contactId: string, dob: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const { error } = await s.from("contacts")
    .update({ date_of_birth: dob || null }).eq("id", contactId).eq("org_id", orgId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true as const, offline: false };
}

export async function addToTextdrip(contactId: string) {
  if (!hasSupabase()) return { ok: false as const, error: "Offline" };
  const { s, orgId } = await ctx();
  const { data: c } = await s.from("contacts")
    .select("phone, first_name, last_name").eq("id", contactId).eq("org_id", orgId).single();
  if (!c?.phone) return { ok: false as const, error: "No phone number on file for this contact." };
  const r = await enrollInTextdrip(s, orgId, contactId, c.phone, `${c.first_name} ${c.last_name ?? ""}`.trim());
  revalidatePath(`/contacts/${contactId}`); revalidatePath("/");
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? "Textdrip enroll failed" };
}

export async function saveTextdripSettings(cfg: { apiKey: string; campaignId: string; endpoint: string; sendEndpoint: string }) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const patch: Record<string, unknown> = {
    org_id: orgId,
    campaign_id: cfg.campaignId?.trim() || null,
    endpoint: cfg.endpoint?.trim() || null,
    send_endpoint: cfg.sendEndpoint?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (cfg.apiKey?.trim()) patch.api_key = cfg.apiKey.trim(); // blank = keep existing
  const { error } = await s.from("textdrip_settings").upsert(patch, { onConflict: "org_id" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings"); revalidatePath("/");
  return { ok: true as const, offline: false };
}

export async function toggleEventDone(eventId: string, done: boolean) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  if (done) await s.from("event_checkoffs").upsert({ org_id: orgId, event_id: eventId }, { onConflict: "org_id,event_id" });
  else await s.from("event_checkoffs").delete().eq("org_id", orgId).eq("event_id", eventId);
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function saveContactNote(contactId: string, notes: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const { error } = await s.from("contacts")
    .update({ notes: notes.trim() || null }).eq("id", contactId).eq("org_id", orgId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true as const, offline: false };
}

export async function deleteContact(contactId: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  // child rows (activities, tasks, deals, policies, …) cascade on delete
  const { error } = await s.from("contacts").delete().eq("id", contactId).eq("org_id", orgId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clients"); revalidatePath("/");
  return { ok: true as const, offline: false };
}

export async function deleteContacts(ids: string[]) {
  if (!hasSupabase()) return { ok: true as const, offline: true, deleted: 0 };
  if (!ids.length) return { ok: false as const, error: "Nothing selected" };
  const { s, orgId } = await ctx();
  const { error } = await s.from("contacts").delete().in("id", ids).eq("org_id", orgId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clients"); revalidatePath("/");
  return { ok: true as const, offline: false, deleted: ids.length };
}

export async function updateProfile(fullName: string) {
  if (!hasSupabase()) return { ok: true, offline: true };
  const name = fullName.trim();
  if (!name) return { ok: false, error: "Name can't be empty" };
  const { s, userId } = await ctx();
  const { error } = await s.from("profiles").update({ full_name: name }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, offline: false };
}

// ── Phase 8: AI assistant actions ───────────────────────────

import { complete, aiConfigured } from "@/lib/ai/claude";
import { buildContactContext, toneSamples } from "@/lib/ai/context";
import { sendSMS, twilioConfigured } from "@/lib/integrations/twilio";
import { enrollInTextdrip, sendTextdripSMS, getTextdripConfig, canSend } from "@/lib/integrations/textdrip";
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
  if (channel === "text" && c?.phone) {
    // Prefer Textdrip (your Textdrip number); fall back to Twilio only if chosen/configured
    const tdCfg = await getTextdripConfig(s, orgId);
    if (canSend(tdCfg)) sent = await sendTextdripSMS(s, orgId, contactId, c.phone, finalText);
    else if (twilioConfigured()) sent = await sendSMS(s, orgId, contactId, c.phone, finalText);
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

// ── Phase 11: USHA policy import + weekly income ─────────────

const POLICY_STATUS_MAP: Record<string, string> = {
  "in force": "active", active: "active", issued: "active", inforce: "active",
  withdrawn: "cancelled", "not taken": "cancelled", declined: "cancelled",
  cancelled: "cancelled", canceled: "cancelled", lapsed: "lapsed", pending: "pending",
};

const POLICY_HEADERS: Record<string, string> = {
  appid: "app_id", "app id": "app_id", "application id": "app_id",
  "policy number": "app_id", "policy #": "app_id", policy: "app_id",
  name: "name", client: "name", insured: "name", "client name": "name", member: "name",
  product: "product", plan: "product", "product name": "product", coverage: "product",
  status: "status",
  "effective date": "eff", effective: "eff", "eff date": "eff", "effective dt": "eff",
  premium: "premium", "annual premium": "premium", "monthly premium": "premium",
  fees: "fees", assoc: "assoc", association: "assoc",
  total: "total", "total premium": "total",
};

const money = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
};
const toDate = (v: string | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const titleCase = (str: string): string =>
  str.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).trim();

/** Import a carrier sales report (USHA). Creates/matches clients and their
 *  policies; dedupes on the application id so re-uploads update in place. */
export async function importPolicies(csvText: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true, created: 0, updated: 0, clients: 0 };
  const { s, orgId } = await ctx();

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false as const, error: "No data rows found in the file" };

  const headers = rows[0].map((h) => POLICY_HEADERS[h.trim().toLowerCase()] ?? null);
  if (!headers.includes("name") || !headers.includes("status")) {
    return { ok: false as const, error: "Couldn't find Name and Status columns — make sure it's the sales report saved as CSV." };
  }

  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && r[i] != null) rec[h] = String(r[i]).trim(); });
    return rec;
  }).filter((r) => r.name && !/^\s*total\s*$/i.test(r.name));

  const [{ data: existingContacts }, { data: existingPolicies }] = await Promise.all([
    s.from("contacts").select("id, first_name, last_name").eq("org_id", orgId),
    s.from("policies").select("id, external_id").eq("org_id", orgId),
  ]);
  const nameKey = (f: string, l: string) => `${f} ${l}`.trim().toLowerCase();
  const byName = new Map((existingContacts ?? []).map((c: any) => [nameKey(c.first_name, c.last_name ?? ""), c.id]));
  const byExt = new Map((existingPolicies ?? []).filter((p: any) => p.external_id).map((p: any) => [p.external_id, p.id]));

  let created = 0, updated = 0, clients = 0;
  for (const r of records) {
    let first = r.name, last = "";
    if (r.name.includes(",")) { const [l, f] = r.name.split(","); last = (l ?? "").trim(); first = (f ?? "").trim(); }
    else { const p = r.name.split(/\s+/); first = p[0]; last = p.slice(1).join(" "); }
    first = titleCase(first); last = titleCase(last);

    const key = nameKey(first, last);
    let contactId = byName.get(key);
    if (!contactId) {
      const { data: ins } = await s.from("contacts").insert({
        org_id: orgId, first_name: first || "Unknown", last_name: last || null,
        lifecycle: "client", lead_source: "USHA import",
      }).select("id").single();
      if (ins) { contactId = ins.id; byName.set(key, ins.id); clients++; }
    }
    if (!contactId) continue;

    const raw = r.status ?? "";
    const premium = money(r.premium);
    const total = r.total ? money(r.total) : premium + money(r.fees) + money(r.assoc);
    const appId = r.app_id || null;
    const payload = {
      org_id: orgId, contact_id: contactId,
      product_type: r.product || "Policy",
      status: POLICY_STATUS_MAP[raw.toLowerCase()] ?? "pending",
      source_status: raw || null,
      premium_amount: premium, total_amount: total,
      effective_date: toDate(r.eff),
      external_id: appId,
    };
    const existingId = appId ? byExt.get(appId) : null;
    if (existingId) {
      await s.from("policies").update(payload).eq("id", existingId).eq("org_id", orgId);
      updated++;
    } else {
      const { data: ins } = await s.from("policies").insert(payload).select("id").single();
      if (ins) { created++; if (appId) byExt.set(appId, ins.id); }
    }
  }

  revalidatePath("/reports"); revalidatePath("/");
  return { ok: true as const, offline: false, created, updated, clients };
}

export async function logIncome(amount: number, paidOn: string, note?: string, category?: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  if (!(amount > 0) || !paidOn) return { ok: false as const, error: "Enter an amount and a pay date." };
  const cat = category?.trim() || "USHA commission";
  const { s, orgId } = await ctx();
  const { error } = await s.from("income_entries").insert({
    org_id: orgId, amount, paid_on: paidOn,
    source: cat, category: cat, note: note?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/reports"); revalidatePath("/budget"); revalidatePath("/");
  return { ok: true as const, offline: false };
}

export async function deleteIncome(id: string) {
  if (!hasSupabase()) return { ok: true };
  const { s, orgId } = await ctx();
  await s.from("income_entries").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/reports"); revalidatePath("/budget"); revalidatePath("/");
  return { ok: true };
}

// ── Phase 12: budget — expenses, recurring bills, goals, bank import ──

/** Merchant → {kind, category}. First match wins; order most-specific first.
 *  kind "transfer" means excluded from spending (moving your own money). */
const MERCHANT_RULES: { re: RegExp; kind: string; category: string }[] = [
  // transfers / moving own money — excluded from spend
  { re: /internet transfer|transfer to|transfer from|to \*\d|cns|apple cash|cash app|venmo|zelle|acorns|pershing|brokerage|robinhood|coinbase/i, kind: "transfer", category: "Transfer" },
  // business
  { re: /textdrip|wix\b|godaddy|canva|calendly|zoom/i, kind: "business", category: "Software & Tools" },
  { re: /vanillasoft|ringy|lead|zillow|smartfinancial/i, kind: "business", category: "Leads" },
  { re: /ushealth|usha|e&o|national general|naaip|nipr|state of .* insurance|license|appointment fee/i, kind: "business", category: "Licensing & E&O" },
  { re: /facebook|meta pl|google ads|mailchimp|constant contact/i, kind: "business", category: "Marketing" },
  // personal — auto & gas
  { re: /racetrac|sunoco|shell|chevron|exxon|mobil(?!e)|marathon|wawa|circle k|speedway|bp#|7-eleven|citgo|quik ?trip/i, kind: "personal", category: "Gas" },
  { re: /fox best rate|car ?payment|toyota|honda|ally|carmax|autozone|o'?reilly|jiffy|valvoline|dmv|clearwater/i, kind: "personal", category: "Car/Auto" },
  // pet
  { re: /petsmart|petco|chewy|\bvet\b|veterin|pet ?supplies/i, kind: "personal", category: "Suki (pet)" },
  // groceries
  { re: /publix|walmart|wal-mart|aldi|kroger|whole foods|trader joe|winn.?dixie|sprouts|costco|sam's club|instacart/i, kind: "personal", category: "Groceries" },
  // dining / going out
  { re: /tst\*|sq \*|dunkin|starbucks|mcdonald|wendy|chick-fil-a|chipotle|taqueria|cava|grain & berry|eggbred|deli|restaurant|grill|cafe|coffee|uber eats|doordash|grubhub|pizza|bar &|brew/i, kind: "personal", category: "Going Out" },
  // shopping / decor
  { re: /altar'?d state|five below|amazon|amzn|target|ross |tj ?maxx|marshalls|shein|old navy|h&m|nordstrom/i, kind: "personal", category: "Shopping" },
  { re: /homegoods|home ?depot|lowe'?s|wayfair|ikea|at home|hobby lobby/i, kind: "personal", category: "Home Decor" },
  // subscriptions / entertainment
  { re: /spotify|netflix|hulu|disney|youtube|uber \*?one|apple\.com\/bill|audible|hbo|paramount|peacock/i, kind: "personal", category: "Subscriptions" },
  // health / pharmacy / personal care
  { re: /pharmacy|cvs|walgreens|analyte|quest diag|labcorp|clinic|dental|hospital|axcess/i, kind: "personal", category: "Health/Medical" },
  { re: /sephora|ulta|sally beauty|nail|salon|barber|hair|spa\b|massage/i, kind: "personal", category: "Personal Care" },
  // gym
  { re: /planet fitness|la fitness|crunch|gym|orangetheory|peloton|equinox|ymca/i, kind: "personal", category: "Gym" },
  // phone / utilities
  { re: /verizon|t-mobile|at&t|cricket|mint mobile/i, kind: "personal", category: "Phone" },
  { re: /duke energy|teco|electric|water util|city of .*util|spectrum|xfinity|comcast/i, kind: "personal", category: "Utilities" },
  // fees & debt
  { re: /late fee|overdraft|nsf|invalid address|service charge|annual fee|interest charge|finance charge/i, kind: "personal", category: "Bank Fees" },
  { re: /card ?payment|cc pymt|credit card pmt|synchrony|capital one|discover pmt/i, kind: "personal", category: "Credit Card/Debt" },
  // rent
  { re: /\brent\b|apartment|property mgmt|leasing|zillow rent/i, kind: "personal", category: "Rent" },
];

function categorizeMerchant(desc: string): { kind: string; category: string } {
  for (const r of MERCHANT_RULES) if (r.re.test(desc)) return { kind: r.kind, category: r.category };
  return { kind: "personal", category: "Uncategorized" };
}

const CSV_EXP_HEADERS: Record<string, string> = {
  date: "date", "post date": "date", "posted date": "date", "transaction date": "date", "trans date": "date",
  description: "desc", "transaction description": "desc", merchant: "desc", name: "desc", payee: "desc", memo: "desc",
  amount: "amount", debit: "debit", "withdrawal/debit": "debit", withdrawal: "debit",
  credit: "credit", "deposit/credit": "credit", deposit: "credit",
  direction: "direction", type: "direction",
};

/** Import a bank/card CSV of transactions into expenses (auto-categorized).
 *  Skips credits/deposits and transfers; dedupes on a date+desc+amount fingerprint. */
export async function importExpenses(csvText: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true, added: 0, skipped: 0, uncategorized: 0 };
  const { s, orgId } = await ctx();
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false as const, error: "No rows found in the file" };

  const headers = rows[0].map((h) => CSV_EXP_HEADERS[h.trim().toLowerCase()] ?? null);
  if (!headers.includes("date") || !headers.includes("desc")) {
    return { ok: false as const, error: "Couldn't find Date and Description columns in the file." };
  }

  const recs = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && r[i] != null) rec[h] = String(r[i]).trim(); });
    return rec;
  }).filter((r) => r.desc && r.date);

  const { data: existing } = await s.from("expenses").select("external_id").eq("org_id", orgId);
  const seen = new Set((existing ?? []).map((e: any) => e.external_id).filter(Boolean));

  let added = 0, skipped = 0, uncategorized = 0;
  const toInsert: any[] = [];
  for (const r of recs) {
    // determine amount + whether it's money out
    let out = 0;
    if (r.debit || r.credit) {
      if (r.debit && money(r.debit) > 0) out = money(r.debit);
      else { skipped++; continue; }                    // a credit/deposit → not an expense
    } else {
      const a = money(r.amount);
      const dir = (r.direction ?? "").toLowerCase();
      if (dir.includes("credit") || dir.includes("deposit")) { skipped++; continue; }
      out = Math.abs(a);
      if (a > 0 && dir === "") { /* positive amount, assume charge */ }
    }
    if (!(out > 0)) { skipped++; continue; }

    const { kind, category } = categorizeMerchant(r.desc);
    if (kind === "transfer") { skipped++; continue; }  // moving own money, not spending
    if (category === "Uncategorized") uncategorized++;

    const spent = toDate(r.date);
    const fp = `${spent}|${r.desc.slice(0, 40)}|${out.toFixed(2)}`;
    if (seen.has(fp)) { skipped++; continue; }
    seen.add(fp);
    toInsert.push({
      org_id: orgId, amount: out, spent_on: spent ?? new Date().toISOString().slice(0, 10),
      kind, category, merchant: r.desc.slice(0, 120), source: "bank", external_id: fp,
    });
    added++;
  }
  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const { error } = await s.from("expenses").insert(toInsert.slice(i, i + 100));
      if (error) {
        const hint = /does not exist|schema cache/i.test(error.message)
          ? " — run budget_setup.sql in Supabase first."
          : "";
        return { ok: false as const, error: error.message + hint };
      }
    }
  }
  if (added === 0) {
    return { ok: false as const, error: `No new purchases found (skipped ${skipped}). Check the file has Date, Description, Amount columns.` };
  }
  revalidatePath("/budget"); revalidatePath("/");
  return { ok: true as const, offline: false, added, skipped, uncategorized };
}

export async function logExpense(amount: number, spentOn: string, kind: string, category: string, note?: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  if (!(amount > 0) || !spentOn || !category) return { ok: false as const, error: "Enter amount, date, and category." };
  const { s, orgId } = await ctx();
  const { error } = await s.from("expenses").insert({
    org_id: orgId, amount, spent_on: spentOn,
    kind: kind === "business" ? "business" : "personal",
    category, note: note?.trim() || null, source: "manual",
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/budget"); revalidatePath("/");
  return { ok: true as const, offline: false };
}

export async function updateExpenseCategory(id: string, kind: string, category: string) {
  if (!hasSupabase()) return { ok: true };
  const { s, orgId } = await ctx();
  await s.from("expenses").update({ kind: kind === "business" ? "business" : "personal", category })
    .eq("id", id).eq("org_id", orgId);
  revalidatePath("/budget");
  return { ok: true };
}

export async function deleteExpense(id: string) {
  if (!hasSupabase()) return { ok: true };
  const { s, orgId } = await ctx();
  await s.from("expenses").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/budget"); revalidatePath("/");
  return { ok: true };
}

export async function addRecurring(label: string, amount: number, kind: string, category: string) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  if (!label.trim() || !(amount > 0) || !category) return { ok: false as const, error: "Enter a label, amount, and category." };
  const { s, orgId } = await ctx();
  const { error } = await s.from("recurring_expenses").insert({
    org_id: orgId, label: label.trim(), amount,
    kind: kind === "business" ? "business" : "personal", category,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/budget"); revalidatePath("/");
  return { ok: true as const, offline: false };
}

export async function deleteRecurring(id: string) {
  if (!hasSupabase()) return { ok: true };
  const { s, orgId } = await ctx();
  await s.from("recurring_expenses").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/budget"); revalidatePath("/");
  return { ok: true };
}

export async function saveBudgetGoals(incomeGoal: number, savingsGoal: number) {
  if (!hasSupabase()) return { ok: true as const, offline: true };
  const { s, orgId } = await ctx();
  const { error } = await s.from("budget_settings").upsert({
    org_id: orgId, income_goal: incomeGoal || 0, savings_goal: savingsGoal || 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/budget");
  return { ok: true as const, offline: false };
}
