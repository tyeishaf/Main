import type {
  Contact, DashboardData, PipelineStage, Appointment,
  TaskItem, TaskKind, TaskTag, TimelineEvent, MustDoItem,
} from "./types";
import { affirmationForToday } from "./affirmations";
import { ctx, hasSupabase, humanize } from "./supabase";
import {
  mockDashboardData, mockContact, mockPipeline, mockAppointments, mockDraftMessage,
} from "./mock";

/**
 * DATA PROVIDER — Phase 5: live Supabase queries.
 * Falls back to mock data when env vars are absent, so `npm run dev`
 * works out of the box before you've created a Supabase project.
 */

export { DISPOSITIONS, TERMINAL_DISPOSITIONS } from "./mock";

// ── classification helpers (Phase 7's engine will set these directly) ──
function classify(taskType: string, title: string, lastContactAt: string | null): { kind: TaskKind; tag: TaskTag } {
  const t = title.toLowerCase();
  if (t.includes("birthday")) return { kind: "birthday", tag: "birthday" };
  if (t.includes("renewal")) return { kind: "renewal", tag: "renewal" };
  const staleDays = lastContactAt
    ? (Date.now() - new Date(lastContactAt).getTime()) / 86_400_000
    : 99;
  if (staleDays >= 9) return { kind: "cold", tag: "cold" };
  const kind = (["call", "text", "email"].includes(taskType) ? taskType : "call") as TaskKind;
  return { kind, tag: "followup" };
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasSupabase()) return mockDashboardData();

  const { s, orgId, firstName } = await ctx();
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

  const dayStartIso = dayStart.toISOString();
  const [tasksQ, policiesQ, dealsQ, briefingQ, affirmQ] = await Promise.all([
    s.from("tasks")
      .select("id, type, title, description, priority, due_at, contact_id, contacts(first_name, last_name, lead_score, last_contact_at, dispositions:current_disposition_id(name))")
      .eq("org_id", orgId)
      .eq("status", "open")
      .lte("due_at", dayEnd.toISOString())
      .order("due_at"),
    s.from("policies")
      .select("annual_commission, status")
      .eq("org_id", orgId)
      .eq("status", "active"),
    s.from("deals")
      .select("status")
      .eq("org_id", orgId),
    s.from("ai_outputs").select("content")
      .eq("org_id", orgId).eq("type", "daily_briefing")
      .gte("created_at", dayStartIso)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    s.from("ai_outputs").select("content")
      .eq("org_id", orgId).eq("prompt_version", "affirmation-v1")
      .gte("created_at", dayStartIso)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const rows = tasksQ.data ?? [];
  const tasks: TaskItem[] = rows.map((r: any) => {
    const c = r.contacts;
    const { kind, tag } = classify(r.type, r.title, c?.last_contact_at ?? null);
    return {
      id: r.id,
      contactId: r.contact_id,
      kind, tag,
      name: c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : r.title,
      note: r.description ?? r.title,
      score: c?.lead_score ?? 0,
      disposition: c?.dispositions?.name ?? "New Lead",
      lastContact: humanize(c?.last_contact_at ?? null),
    };
  });

  const counts = {
    all: tasks.length,
    followup: tasks.filter((t) => t.tag === "followup").length,
    birthday: tasks.filter((t) => t.tag === "birthday").length,
    renewal: tasks.filter((t) => t.tag === "renewal").length,
    cold: tasks.filter((t) => t.tag === "cold").length,
  };

  // Must-do: today's urgent + high priority tasks (capped at 5)
  const mustDo: MustDoItem[] = rows
    .filter((r: any) => ["urgent", "high"].includes(r.priority))
    .slice(0, 5)
    .map((r: any) => ({
      id: r.id,
      title: r.title,
      why: r.description ?? "",
      urgent: r.priority === "urgent",
    }));

  // Metrics — simple v1: annualized commission / 12, deal win rate, active count.
  const active = policiesQ.data ?? [];
  const monthRev = Math.round(active.reduce((a: number, p: any) => a + Number(p.annual_commission ?? 0), 0) / 12);
  const deals = dealsQ.data ?? [];
  const won = deals.filter((d: any) => d.status === "won").length;
  const closedTotal = deals.filter((d: any) => d.status !== "open").length;

  return {
    userFirstName: firstName,
    dateLabel: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    affirmation: affirmQ.data?.content || affirmationForToday(),
    briefing: {
      // Claude-written morning note; template fallback if the job hasn't run
      paragraph: briefingQ.data?.content || buildBriefingFallback(counts, tasks),
      counts,
    },
    mustDo,
    metrics: {
      monthRevenue: `$${monthRev.toLocaleString()}`,
      monthDelta: "",
      conversion: closedTotal ? `${Math.round((won / closedTotal) * 100)}%` : "—",
      policies: active.length,
    },
    tasks,
    sources: [
      { provider: "vanillasoft", label: "VanillaSoft", status: "Connect in Phase 7", live: false },
      { provider: "textdrip", label: "Textdrip", status: "Connect in Phase 7", live: false },
    ],
  };
}

function buildBriefingFallback(
  c: DashboardData["briefing"]["counts"],
  tasks: TaskItem[]
): string {
  const top = [...tasks].sort((a, b) => b.score - a.score)[0];
  const parts: string[] = [];
  if (c.followup) parts.push(`${c.followup} follow-up${c.followup > 1 ? "s" : ""} due`);
  if (c.birthday) parts.push(`${c.birthday} birthday${c.birthday > 1 ? "s" : ""} worth a personal note`);
  if (c.renewal) parts.push(`${c.renewal} renewal${c.renewal > 1 ? "s" : ""} to schedule`);
  if (c.cold) parts.push(`${c.cold} lead${c.cold > 1 ? "s" : ""} about to go cold`);
  const base = parts.length ? `You have ${parts.join(", ")}.` : "A quiet day — a good one for prospecting.";
  return top ? `${base} Start with ${top.name.split(" ")[0]} — your warmest lead right now.` : base;
}

export async function getContact(id: string): Promise<Contact> {
  if (!hasSupabase()) return mockContact(id);

  const { s, orgId } = await ctx();
  const [contactQ, actsQ] = await Promise.all([
    s.from("contacts")
      .select("id, first_name, last_name, lead_score, coverage_type, last_contact_at, dispositions:current_disposition_id(name)")
      .eq("org_id", orgId).eq("id", id).single(),
    s.from("activities")
      .select("type, direction, body, occurred_at")
      .eq("org_id", orgId).eq("contact_id", id)
      .order("occurred_at", { ascending: false }).limit(50),
  ]);

  const c: any = contactQ.data;
  const typeMap: Record<string, TimelineEvent["type"]> = {
    call: "call", sms: "text", email: "email", note: "note",
    ai_summary: "ai", system: "sys", disposition_change: "sys",
  };

  return {
    id,
    name: `${c.first_name} ${c.last_name ?? ""}`.trim(),
    summaryLine: `${(c.coverage_type ?? []).join(", ") || "Prospect"} · Score ${c.lead_score}`,
    score: c.lead_score,
    disposition: c.dispositions?.name ?? "New Lead",
    lastContact: humanize(c.last_contact_at),
    timeline: (actsQ.data ?? []).map((a: any) => ({
      at: humanize(a.occurred_at),
      type: typeMap[a.type] ?? "sys",
      text: a.body ?? "",
    })),
  };
}

export async function getPipeline(): Promise<PipelineStage[]> {
  if (!hasSupabase()) return mockPipeline();
  const { s } = await ctx(); // RLS scopes rows to the session org
  const { data } = await s
    .from("pipeline_stages")
    .select("name, sort_order, deals(product_type, est_monthly_premium, status, contacts(first_name, last_name))")
    .order("sort_order");
  return (data ?? []).map((st: any) => ({
    name: st.name,
    deals: (st.deals ?? [])
      .filter((d: any) => d.status === "open" || st.name === "Issued")
      .map((d: any) => {
        const n = d.contacts ? `${d.contacts.first_name} ${(d.contacts.last_name ?? "").charAt(0)}.` : "—";
        return `${n} · ${d.product_type}${d.est_monthly_premium ? ` $${d.est_monthly_premium}/mo` : ""}`;
      }),
  }));
}

export async function getAppointments(): Promise<Appointment[]> {
  if (!hasSupabase()) return mockAppointments();
  const { s, orgId } = await ctx();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const { data } = await s
    .from("appointments")
    .select("title, starts_at")
    .eq("org_id", orgId)
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .order("starts_at");
  return (data ?? []).map((a: any) => ({
    time: new Date(a.starts_at)
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      .replace(" AM", "a").replace(" PM", "p"),
    title: a.title,
  }));
}

export async function draftMessage(contactName: string): Promise<string> {
  // Phase 8: Claude API with contact context + tone profile
  return mockDraftMessage(contactName);
}
