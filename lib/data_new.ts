import "server-only";
import type {
  Contact, DashboardData, PipelineStage, Appointment,
  TaskItem, TaskKind, TaskTag, TimelineEvent, MustDoItem,
} from "./types";
import { affirmationForToday } from "./affirmations";
import { db, ORG_ID } from "./supabase/server";
import { timeAgo, clock } from "./format";

/**
 * DATA PROVIDER — Phase 5: real Supabase queries.
 * The UI still imports only from this file; nothing above changed.
 */

export const TERMINAL_DISPOSITIONS = new Set([
  "Do Not Contact", "Dead Lead", "DNQ", "Lost Sale", "Wrong Number",
]);

// ── helpers ──────────────────────────────────────────────────
type TaskRow = {
  id: string; type: string; title: string; description: string | null;
  priority: string; due_at: string | null; status: string;
  contacts: {
    id: string; first_name: string; last_name: string | null;
    lead_score: number; last_contact_at: string | null; lifecycle: string;
    dispositions: { name: string } | null;
  } | null;
};

function toTag(t: TaskRow): TaskTag {
  const title = t.title.toLowerCase();
  if (title.includes("birthday")) return "birthday";
  if (title.includes("renewal")) return "renewal";
  const last = t.contacts?.last_contact_at;
  if (last && Date.now() - new Date(last).getTime() > 8 * 86_400_000 && t.contacts?.lifecycle === "lead")
    return "cold";
  return "followup";
}

function toKind(t: TaskRow, tag: TaskTag): TaskKind {
  if (tag === "birthday" || tag === "renewal" || tag === "cold") return tag;
  return (["call", "text", "email"].includes(t.type) ? t.type : "call") as TaskKind;
}

function toTaskItem(t: TaskRow): TaskItem {
  const tag = toTag(t);
  const c = t.contacts;
  return {
    id: t.id,
    contactId: c?.id ?? "",
    kind: toKind(t, tag),
    tag,
    name: c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : t.title,
    note: t.description ?? t.title,
    score: c?.lead_score ?? 0,
    disposition: c?.dispositions?.name ?? "New Lead",
    lastContact: timeAgo(c?.last_contact_at ?? null),
  };
}

// ── dashboard ────────────────────────────────────────────────
export async function getDashboardData(): Promise<DashboardData> {
  const s = db();
  const org = ORG_ID();
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [tasksQ, policiesQ, dealsQ, briefingQ] = await Promise.all([
    s.from("tasks")
      .select("id,type,title,description,priority,due_at,status,contacts(id,first_name,last_name,lead_score,last_contact_at,lifecycle,dispositions:current_disposition_id(name))")
      .eq("org_id", org).eq("status", "open")
      .lte("due_at", dayEnd.toISOString())
      .order("due_at", { ascending: true }),
    s.from("policies")
      .select("monthly_premium,annual_commission,effective_date,status")
      .eq("org_id", org).eq("status", "active"),
    s.from("deals").select("status").eq("org_id", org),
    s.from("ai_outputs")
      .select("content").eq("org_id", org).eq("type", "daily_briefing")
      .gte("created_at", dayStart.toISOString())
      .order("created_at", { ascending: false }).limit(1),
  ]);

  const tasks = ((tasksQ.data ?? []) as unknown as TaskRow[]).map(toTaskItem);

  const counts = {
    all: tasks.length,
    followup: tasks.filter((t) => t.tag === "followup").length,
    birthday: tasks.filter((t) => t.tag === "birthday").length,
    renewal: tasks.filter((t) => t.tag === "renewal").length,
    cold: tasks.filter((t) => t.tag === "cold").length,
  };

  // Metrics
  const policies = policiesQ.data ?? [];
  const monthRevenue = policies.reduce((sum, p) => sum + Number(p.monthly_premium ?? 0), 0);
  const soldThisMonth = policies.filter(
    (p) => p.effective_date && new Date(p.effective_date) >= monthStart
  ).length;
  const deals = dealsQ.data ?? [];
  const closed = deals.filter((d) => d.status !== "open").length;
  const won = deals.filter((d) => d.status === "won").length;
  const conversion = closed ? Math.round((won / closed) * 100) : 0;

  // Must-do = today's urgent/high tasks (Phase 8: assistant curates this)
  const mustDoRows = ((tasksQ.data ?? []) as unknown as TaskRow[])
    .filter((t) => ["urgent", "high"].includes(t.priority))
    .slice(0, 5);
  const mustDo: MustDoItem[] = mustDoRows.map((t) => ({
    id: t.id,
    title: t.title,
    why: t.description ?? "",
    urgent: t.priority === "urgent",
  }));

  // Briefing: today's AI note if the Phase 8 job wrote one; template otherwise
  const briefingParagraph =
    briefingQ.data?.[0]?.content ??
    `You have ${counts.followup} follow-ups due, ${counts.birthday} birthday${counts.birthday === 1 ? "" : "s"} worth a personal note, ${counts.renewal} renewal${counts.renewal === 1 ? "" : "s"} to schedule, and ${counts.cold} lead${counts.cold === 1 ? "" : "s"} at risk of going cold. Your hit list is ranked below — start at the top.`;

  return {
    userFirstName: "Tyeisha", // Phase 6: from the authenticated profile
    dateLabel: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    affirmation: affirmationForToday(),
    briefing: { paragraph: briefingParagraph, counts },
    mustDo,
    metrics: {
      monthRevenue: `$${monthRevenue.toLocaleString()}`,
      monthDelta: soldThisMonth > 0 ? `▲ ${soldThisMonth} new` : "",
      conversion: `${conversion}%`,
      policies: policies.length,
    },
    tasks,
    sources: [
      // Phase 7: read real sync state from the `integrations` table
      { provider: "vanillasoft", label: "VanillaSoft", status: "Connect in Phase 7", live: false },
      { provider: "textdrip", label: "Textdrip", status: "Connect in Phase 7", live: false },
    ],
  };
}

// ── contact detail ───────────────────────────────────────────
const ACTIVITY_TYPE_MAP: Record<string, TimelineEvent["type"]> = {
  call: "call", sms: "text", email: "email", note: "note",
  ai_summary: "ai", system: "sys", disposition_change: "sys",
  stage_change: "sys", task_completed: "sys", meeting: "note", document: "sys",
};

export async function getContact(id: string): Promise<Contact> {
  const s = db();
  const [contactQ, activitiesQ] = await Promise.all([
    s.from("contacts")
      .select("id,first_name,last_name,lead_score,coverage_type,last_contact_at,dispositions:current_disposition_id(name)")
      .eq("id", id).single(),
    s.from("activities")
      .select("type,body,occurred_at")
      .eq("contact_id", id)
      .order("occurred_at", { ascending: false }).limit(50),
  ]);

  const c = contactQ.data;
  if (!c) throw new Error("Contact not found");
  const coverage = (c.coverage_type?.[0] ?? "coverage").replace(/^\w/, (m: string) => m.toUpperCase());

  return {
    id: c.id,
    name: `${c.first_name} ${c.last_name ?? ""}`.trim(),
    summaryLine: `${coverage} plan · Score ${c.lead_score}`,
    score: c.lead_score,
    disposition: (c.dispositions as { name: string } | null)?.name ?? "New Lead",
    lastContact: timeAgo(c.last_contact_at),
    timeline: (activitiesQ.data ?? []).map((a) => ({
      at: new Date(a.occurred_at).toLocaleString("en-US", {
        weekday: "short", hour: "numeric", minute: "2-digit",
      }),
      type: ACTIVITY_TYPE_MAP[a.type] ?? "sys",
      text: a.body ?? "",
    })),
  };
}

export async function getDispositions(): Promise<string[]> {
  const s = db();
  const { data } = await s.from("dispositions")
    .select("name").eq("org_id", ORG_ID()).order("sort_order");
  return (data ?? []).map((d) => d.name);
}

// ── pipeline & calendar ──────────────────────────────────────
export async function getPipeline(): Promise<PipelineStage[]> {
  const s = db();
  const { data } = await s.from("pipeline_stages")
    .select("id,name,sort_order,deals(product_type,est_monthly_premium,status,contacts(first_name,last_name))")
    .order("sort_order");
  return (data ?? []).map((st) => ({
    name: st.name,
    deals: ((st.deals ?? []) as any[])
      .filter((d) => d.status === "open" || st.name === "Issued")
      .map((d) => {
        const c = d.contacts;
        const who = c ? `${c.first_name} ${(c.last_name ?? "").charAt(0)}.` : "—";
        return `${who} · ${d.product_type}`;
      }),
  }));
}

export async function getAppointments(): Promise<Appointment[]> {
  const s = db();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const { data } = await s.from("appointments")
    .select("title,starts_at").eq("org_id", ORG_ID())
    .gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString())
    .order("starts_at");
  return (data ?? []).map((a) => ({ time: clock(a.starts_at), title: a.title }));
}

export async function draftMessage(contactName: string): Promise<string> {
  // Phase 8: Claude API with contact timeline + tone profile
  return `Hi ${contactName.split(" ")[0]}! It's been a few days since we talked about your coverage. I found two plans in your budget with the benefits you cared about most. Want me to walk you through them? I have openings tomorrow morning. 🌸`;
}
