import type { SupabaseClient } from "@supabase/supabase-js";
import { checkGuardrails, nextAllowedTime } from "./guardrails";
import { sendSMS, twilioConfigured } from "@/lib/integrations/twilio";
import { sendEmail, gmailConfigured } from "@/lib/integrations/gmail";

/**
 * SEQUENCE ENGINE — the heart of "never lose a lead".
 *
 * State machine:
 *   tick() finds enrollments whose next_run_at is due and MATERIALIZES
 *   the current step:
 *     - call  → an open task on your list (engine then waits for outcome)
 *     - text  → auto-send via Twilio if connected & guardrails pass,
 *               else a task for you (engine schedules next step)
 *     - email → same, via Gmail
 *   advance() moves an enrollment after an outcome, honoring the step's
 *   branch_rules: {"no_answer": 2, "replied": "pause", ...}.
 *   pauseOnInbound() is called by webhooks the moment a lead replies —
 *   automation stops, a "Respond" task is created. Never auto-message
 *   someone who just answered you.
 */

interface StepRow {
  id: string; step_order: number; task_type: string;
  delay_hours: number; branch_rules: Record<string, unknown>;
  template_id: string | null;
}

export async function tick(s: SupabaseClient): Promise<{ materialized: number }> {
  const { data: due } = await s
    .from("sequence_enrollments")
    .select("id, org_id, contact_id, sequence_id, current_step")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .limit(50);

  let materialized = 0;
  for (const e of due ?? []) {
    try {
      await materializeCurrentStep(s, e as any);
      materialized++;
    } catch (err) {
      console.error("tick: enrollment", (e as any).id, err);
    }
  }
  return { materialized };
}

async function getSteps(s: SupabaseClient, sequenceId: string): Promise<StepRow[]> {
  const { data } = await s
    .from("sequence_steps")
    .select("id, step_order, task_type, delay_hours, branch_rules, template_id")
    .eq("sequence_id", sequenceId)
    .order("step_order");
  return (data ?? []) as StepRow[];
}

async function materializeCurrentStep(
  s: SupabaseClient,
  e: { id: string; org_id: string; contact_id: string; sequence_id: string; current_step: string | null }
) {
  const steps = await getSteps(s, e.sequence_id);
  const step = e.current_step
    ? steps.find((x) => x.id === e.current_step)
    : steps[0];
  if (!step) {
    await s.from("sequence_enrollments")
      .update({ status: "completed", ended_at: new Date().toISOString(), next_run_at: null })
      .eq("id", e.id);
    return;
  }

  // First materialization of the first step: pin current_step
  if (!e.current_step) {
    await s.from("sequence_enrollments").update({ current_step: step.id }).eq("id", e.id);
  }

  const guard = await checkGuardrails(s, e.org_id, e.contact_id);
  if (!guard.ok) {
    if (guard.reason === "dnc") {
      await s.from("sequence_enrollments")
        .update({ status: "exited", paused_reason: "do_not_contact", next_run_at: null, ended_at: new Date().toISOString() })
        .eq("id", e.id);
      return;
    }
    await s.from("sequence_enrollments")
      .update({ next_run_at: (guard.deferUntil ?? nextAllowedTime()).toISOString() })
      .eq("id", e.id);
    return;
  }

  const { data: contact } = await s
    .from("contacts").select("first_name, phone, email").eq("id", e.contact_id).single();

  if (step.task_type === "call") {
    // Calls are always yours. Engine waits for the outcome you record.
    await s.from("tasks").insert({
      org_id: e.org_id, contact_id: e.contact_id, type: "call",
      title: `Sequence call — ${contact?.first_name ?? "lead"} (step ${step.step_order})`,
      priority: "high", due_at: new Date().toISOString(),
      source: "sequence", enrollment_id: e.id,
    });
    await s.from("sequence_enrollments").update({ next_run_at: null }).eq("id", e.id); // waiting on outcome
    return;
  }

  // text / email — try auto-send, fall back to a task for you
  const body = await renderTemplate(s, e.org_id, step.template_id, step.task_type, contact?.first_name ?? "");
  let sent = false;

  if (step.task_type === "text" && twilioConfigured() && contact?.phone) {
    sent = await sendSMS(s, e.org_id, e.contact_id, contact.phone, body.text);
  } else if (step.task_type === "email" && gmailConfigured() && contact?.email) {
    sent = await sendEmail(s, e.org_id, e.contact_id, contact.email, body.subject, body.text);
  }

  if (!sent) {
    await s.from("tasks").insert({
      org_id: e.org_id, contact_id: e.contact_id, type: step.task_type,
      title: `Sequence ${step.task_type} — ${contact?.first_name ?? "lead"} (step ${step.step_order})`,
      description: body.text.slice(0, 200),
      priority: "normal", due_at: new Date().toISOString(),
      source: "sequence", enrollment_id: e.id,
    });
    await s.from("sequence_enrollments").update({ next_run_at: null }).eq("id", e.id); // waits for you
    return;
  }

  // Auto-sent: advance immediately on the default path
  await advance(s, e.id, "completed");
}

/** Move an enrollment forward after an outcome (task completion or auto-send). */
export async function advance(s: SupabaseClient, enrollmentId: string, outcome: string) {
  const { data: e } = await s
    .from("sequence_enrollments")
    .select("id, sequence_id, current_step, status")
    .eq("id", enrollmentId).single();
  if (!e || e.status !== "active") return;

  const steps = await getSteps(s, e.sequence_id);
  const cur = steps.find((x) => x.id === e.current_step) ?? steps[0];
  const rule = cur?.branch_rules?.[outcome];

  if (rule === "pause") {
    await s.from("sequence_enrollments")
      .update({ status: "paused", paused_reason: `outcome: ${outcome}`, next_run_at: null })
      .eq("id", enrollmentId);
    return;
  }

  let next: StepRow | undefined;
  if (typeof rule === "number") {
    next = steps.find((x) => x.step_order === rule);
  } else {
    next = steps.find((x) => x.step_order === (cur?.step_order ?? 0) + 1);
  }

  if (!next) {
    await s.from("sequence_enrollments")
      .update({ status: "completed", ended_at: new Date().toISOString(), next_run_at: null })
      .eq("id", enrollmentId);
    return;
  }

  await s.from("sequence_enrollments").update({
    current_step: next.id,
    next_run_at: new Date(Date.now() + next.delay_hours * 3600_000).toISOString(),
  }).eq("id", enrollmentId);
}

/** Inbound reply → stop automation, surface a Respond task. */
export async function pauseOnInbound(s: SupabaseClient, orgId: string, contactId: string) {
  const { data: active } = await s
    .from("sequence_enrollments")
    .select("id").eq("contact_id", contactId).eq("status", "active");
  if (active?.length) {
    await s.from("sequence_enrollments")
      .update({ status: "paused", paused_reason: "inbound_reply", next_run_at: null })
      .eq("contact_id", contactId).eq("status", "active");
  }
  await s.from("tasks").insert({
    org_id: orgId, contact_id: contactId, type: "text",
    title: "Respond — they replied!", priority: "urgent",
    due_at: new Date().toISOString(), source: "automation",
  });
}

async function renderTemplate(
  s: SupabaseClient, orgId: string, templateId: string | null,
  channel: string, firstName: string
): Promise<{ subject: string; text: string }> {
  let subject = "Following up on your coverage";
  let body =
    channel === "text"
      ? "Hi {{first_name}}! It's {{agent_name}}, your licensed health advisor. When's a good time for a quick call about your coverage options?"
      : "Hi {{first_name}},\n\nI'd love to walk you through the coverage options I put together for you. When works for a quick call?\n\nWarmly,\n{{agent_name}}";

  if (templateId) {
    const { data: t } = await s.from("message_templates")
      .select("subject, body").eq("id", templateId).single();
    if (t) { subject = t.subject ?? subject; body = t.body; }
  } else {
    const { data: t } = await s.from("message_templates")
      .select("subject, body").eq("org_id", orgId)
      .eq("channel", channel).eq("category", "follow_up").limit(1).maybeSingle();
    if (t) { subject = t.subject ?? subject; body = t.body; }
  }

  const { data: owner } = await s.from("profiles")
    .select("full_name").eq("org_id", orgId).eq("role", "owner").limit(1).maybeSingle();
  const agent = owner?.full_name?.split(" ")[0] ?? "your advisor";

  const render = (x: string) =>
    x.replaceAll("{{first_name}}", firstName || "there").replaceAll("{{agent_name}}", agent);
  return { subject: render(subject), text: render(body) };
}
