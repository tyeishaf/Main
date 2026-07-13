import type {
  Contact, DashboardData, PipelineStage, Appointment,
  TaskItem, TaskKind, TaskTag, TimelineEvent, MustDoItem,
  ClientFilter, ClientListItem, ReportData, MonthPoint, SourceRow, StageValue, IncomeRow,
  BudgetData, BudgetCatRow, ExpenseRow2, RecurringRow,
} from "./types";
import { affirmationForToday } from "./affirmations";
import { ctx, hasSupabase, humanize } from "./supabase";
import {
  mockDashboardData, mockContact, mockPipeline, mockAppointments, mockDraftMessage,
  mockClients, mockReports, mockBudget, TERMINAL_DISPOSITIONS,
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
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const [tasksQ, policiesQ, incomeQ, briefingQ, affirmQ] = await Promise.all([
    s.from("tasks")
      .select("id, type, title, description, priority, due_at, contact_id, contacts(first_name, last_name, lead_score, last_contact_at, dispositions:current_disposition_id(name))")
      .eq("org_id", orgId)
      .eq("status", "open")
      .lte("due_at", dayEnd.toISOString())
      .order("due_at"),
    s.from("policies")
      .select("status, contact_id")
      .eq("org_id", orgId),
    s.from("income_entries")
      .select("amount")
      .eq("org_id", orgId)
      .gte("paid_on", monthStartIso),
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

  // Metrics — real income (this month's payouts), active policies, and
  // conversion by client (any active policy = placed).
  const policies = policiesQ.data ?? [];
  const monthIncome = (incomeQ.data ?? []).reduce((a: number, e: any) => a + Number(e.amount ?? 0), 0);
  const activeCount = policies.filter((p: any) => p.status === "active").length;
  const byContact = new Map<string, boolean>();
  for (const p of policies as any[]) {
    if (!p.contact_id) continue;
    byContact.set(p.contact_id, (byContact.get(p.contact_id) ?? false) || p.status === "active");
  }
  const wonC = [...byContact.values()].filter(Boolean).length;
  const totalC = byContact.size;

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
      monthRevenue: `$${monthIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      monthDelta: "",
      conversion: totalC ? `${Math.round((wonC / totalC) * 100)}%` : "—",
      policies: activeCount,
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
      .select("id, first_name, last_name, lead_score, coverage_type, last_contact_at, phone, phone_alt, email, address, city, state, zip, dispositions:current_disposition_id(name)")
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
    phone: c.phone ?? null,
    phoneAlt: c.phone_alt ?? null,
    email: c.email ?? null,
    location: [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || (c.address ?? null),
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

// ── Phase 9: clients directory ───────────────────────────────

const QUIET_DAYS = 9; // matches the dashboard's "cold" threshold

export async function getClients(q: string, filter: ClientFilter): Promise<ClientListItem[]> {
  const rows = hasSupabase() ? await fetchClients(q) : await mockClients();
  return applyClientFilter(rows, q, filter);
}

async function fetchClients(q: string): Promise<ClientListItem[]> {
  const { s, orgId } = await ctx();
  let query = s.from("contacts")
    .select("id, first_name, last_name, phone, email, lifecycle, lead_score, last_contact_at, coverage_type, dispositions:current_disposition_id(name)")
    .eq("org_id", orgId);
  const needle = q.trim().replace(/[%,]/g, "");
  if (needle) {
    query = query.or(
      `first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%,business_name.ilike.%${needle}%`
    );
  }
  const { data } = await query.order("lead_score", { ascending: false }).limit(500);
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name ?? ""}`.trim(),
    disposition: c.dispositions?.name ?? "New Lead",
    lifecycle: c.lifecycle ?? "lead",
    score: c.lead_score ?? 0,
    lastContact: humanize(c.last_contact_at),
    lastContactAt: c.last_contact_at,
    phone: c.phone,
    email: c.email,
    coverage: (c.coverage_type ?? []).join(", ").replace(/^\w/, (m: string) => m.toUpperCase()) || "Prospect",
  }));
}

function applyClientFilter(rows: ClientListItem[], q: string, filter: ClientFilter): ClientListItem[] {
  const needle = q.trim().toLowerCase();
  let out = needle
    ? rows.filter((c) =>
        [c.name, c.email ?? "", c.phone ?? "", c.disposition].join(" ").toLowerCase().includes(needle))
    : rows;

  const quietSince = Date.now() - QUIET_DAYS * 86_400_000;
  const isQuiet = (c: ClientListItem) =>
    !c.lastContactAt || new Date(c.lastContactAt).getTime() < quietSince;
  const isDnc = (c: ClientListItem) =>
    c.lifecycle === "do_not_contact" || TERMINAL_DISPOSITIONS.has(c.disposition);

  switch (filter) {
    case "leads":   out = out.filter((c) => (c.lifecycle === "lead" || c.lifecycle === "prospect") && !isDnc(c)); break;
    case "clients": out = out.filter((c) => c.lifecycle === "client"); break;
    case "hot":     out = out.filter((c) => c.score >= 70 && !isDnc(c)); break;
    case "quiet":   out = out.filter((c) => isQuiet(c) && !isDnc(c)); break;
    case "dnc":     out = out.filter(isDnc); break;
  }

  return filter === "quiet"
    ? out.sort((a, b) => // longest-silent first — those are the saves
        (a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0) -
        (b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0))
    : out.sort((a, b) => b.score - a.score);
}

// ── Phase 10/11: reporting — income (payout log) + policies (carrier import) ──

const money0 = (n: number) => `$${Math.round(n).toLocaleString()}`;
const money2 = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isWithdrawn = (p: any) => {
  const ss = (p.source_status ?? "").toLowerCase();
  return ss.includes("withdraw") || ss.includes("not taken") ||
    (!ss && p.status === "cancelled");
};
const policyValue = (p: any) => Number(p.total_amount ?? p.premium_amount ?? 0);

export async function getReports(): Promise<ReportData> {
  if (!hasSupabase()) return mockReports();

  const { s, orgId } = await ctx();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [incomeQ, policiesQ, contactsQ, pipelineQ] = await Promise.all([
    s.from("income_entries").select("id, amount, paid_on")
      .eq("org_id", orgId).order("paid_on", { ascending: false }),
    s.from("policies")
      .select("status, source_status, premium_amount, total_amount, effective_date, contact_id")
      .eq("org_id", orgId),
    s.from("contacts").select("id, lead_source").eq("org_id", orgId),
    s.from("pipeline_stages")
      .select("name, sort_order, deals(est_monthly_premium, status)").order("sort_order"),
  ]);

  const income = incomeQ.data ?? [];
  const policies = policiesQ.data ?? [];
  const contacts = contactsQ.data ?? [];

  // ── month buckets (last 6) ──
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-US", { month: "short" }) });
  }
  const incomeByMonth = new Map(monthKeys.map((m) => [m.key, 0]));
  const policiesByMonth = new Map(monthKeys.map((m) => [m.key, 0]));

  // ── income from the payout log ──
  let monthlyIncome = 0, ytdIncome = 0;
  for (const e of income) {
    if (!e.paid_on) continue;
    const amt = Number(e.amount ?? 0);
    const d = new Date(e.paid_on);
    if (d >= yearStart) ytdIncome += amt;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) monthlyIncome += amt;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (incomeByMonth.has(key)) incomeByMonth.set(key, incomeByMonth.get(key)! + amt);
  }

  // ── policies: active count, premium written, withdrawn exposure, trend ──
  for (const p of policies) {
    if (p.status !== "active" || !p.effective_date) continue;
    const d = new Date(p.effective_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (policiesByMonth.has(key)) policiesByMonth.set(key, policiesByMonth.get(key)! + 1);
  }
  const activePolicies = policies.filter((p: any) => p.status === "active");
  const premiumWritten = activePolicies.reduce((a: number, p: any) => a + policyValue(p), 0);
  const withdrawnValue = policies.filter(isWithdrawn).reduce((a: number, p: any) => a + policyValue(p), 0);

  const trend: MonthPoint[] = monthKeys.map((m) => ({
    label: m.label,
    income: Math.round(incomeByMonth.get(m.key)!),
    policies: policiesByMonth.get(m.key)!,
  }));

  // ── conversion by client: any active policy = placed; policies but none active = fell through ──
  const byContact = new Map<string, { active: number; total: number }>();
  for (const p of policies as any[]) {
    if (!p.contact_id) continue;
    const r = byContact.get(p.contact_id) ?? { active: 0, total: 0 };
    r.total += 1; if (p.status === "active") r.active += 1;
    byContact.set(p.contact_id, r);
  }
  let won = 0, lost = 0;
  for (const r of byContact.values()) (r.active > 0 ? won++ : lost++);
  const conversionPct = won + lost ? Math.round((won / (won + lost)) * 100) : 0;

  // ── lead-source performance (won = became a client with an active policy) ──
  const wonContacts = new Set([...byContact.entries()].filter(([, r]) => r.active > 0).map(([id]) => id));
  const bySource = new Map<string, { leads: number; won: number }>();
  for (const c of contacts as any[]) {
    const src = (c.lead_source ?? "Unknown").trim() || "Unknown";
    const row = bySource.get(src) ?? { leads: 0, won: 0 };
    row.leads += 1; if (wonContacts.has(c.id)) row.won += 1;
    bySource.set(src, row);
  }
  const sources: SourceRow[] = [...bySource.entries()]
    .map(([source, r]) => ({ source, leads: r.leads, won: r.won, closeRate: r.leads ? Math.round((r.won / r.leads) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads).slice(0, 6);

  // ── pipeline value by stage (open deals; may be empty) ──
  const pipeline: StageValue[] = ((pipelineQ.data ?? []) as any[]).map((st) => {
    const open = (st.deals ?? []).filter((d: any) => d.status === "open");
    return { stage: st.name, count: open.length, value: Math.round(open.reduce((a: number, d: any) => a + Number(d.est_monthly_premium ?? 0), 0)) };
  }).filter((st) => st.count > 0);

  const recentIncome: IncomeRow[] = (income as any[]).slice(0, 8).map((e) => ({
    id: e.id,
    amount: money2(Number(e.amount ?? 0)),
    paidOn: e.paid_on ? new Date(e.paid_on).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
  }));

  return {
    generatedLabel: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    headline: {
      monthlyIncome: money2(monthlyIncome),
      ytdIncome: money2(ytdIncome),
      activePolicies: activePolicies.length,
      conversion: won + lost ? `${conversionPct}%` : "—",
      premiumWritten: money0(premiumWritten),
      withdrawnValue: money0(withdrawnValue),
    },
    trend,
    conversion: { won, lost, open: 0 },
    sources,
    pipeline,
    recentIncome,
    live: true,
  };
}

// ── Phase 12: budget ─────────────────────────────────────────

export async function getBudget(monthISO?: string): Promise<BudgetData> {
  if (!hasSupabase()) return mockBudget();
  const { s, orgId } = await ctx();
  const now = new Date();
  // monthISO = "YYYY-MM"; default to the current month
  const [y, m] = (monthISO && /^\d{4}-\d{2}$/.test(monthISO))
    ? monthISO.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const viewMonth = new Date(y, m - 1, 1);
  const monthStart = new Date(y, m - 1, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10);

  const [incomeQ, expQ, recurQ, goalsQ] = await Promise.all([
    s.from("income_entries").select("amount").eq("org_id", orgId)
      .gte("paid_on", monthStart).lte("paid_on", monthEnd),
    s.from("expenses").select("id, amount, spent_on, kind, category, merchant, source")
      .eq("org_id", orgId).gte("spent_on", monthStart).lte("spent_on", monthEnd)
      .order("spent_on", { ascending: false }),
    s.from("recurring_expenses").select("id, label, amount, kind, category")
      .eq("org_id", orgId).eq("active", true),
    s.from("budget_settings").select("income_goal, savings_goal").eq("org_id", orgId).maybeSingle(),
  ]);

  const income = (incomeQ.data ?? []).reduce((a: number, e: any) => a + Number(e.amount ?? 0), 0);
  const expenses = expQ.data ?? [];
  const recurring: RecurringRow[] = (recurQ.data ?? []).map((r: any) => ({
    id: r.id, label: r.label, amount: Number(r.amount ?? 0), kind: r.kind, category: r.category,
  }));

  // aggregate by category across this month's expenses + the fixed recurring bills
  const catMap = new Map<string, BudgetCatRow>();
  const add = (kind: string, category: string, amt: number) => {
    const key = `${kind}|${category}`;
    const row = catMap.get(key) ?? { kind: kind as any, category, amount: 0 };
    row.amount += amt; catMap.set(key, row);
  };
  let business = 0, personal = 0;
  for (const e of expenses as any[]) {
    add(e.kind, e.category, Number(e.amount ?? 0));
    if (e.kind === "business") business += Number(e.amount ?? 0); else personal += Number(e.amount ?? 0);
  }
  for (const r of recurring) {
    add(r.kind, r.category, r.amount);
    if (r.kind === "business") business += r.amount; else personal += r.amount;
  }

  const byCategory = [...catMap.values()].sort((a, b) => b.amount - a.amount);
  const totalExpenses = business + personal;
  const recent: ExpenseRow2[] = (expenses as any[]).slice(0, 25).map((e) => ({
    id: e.id,
    date: e.spent_on ? new Date(e.spent_on).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
    merchant: e.merchant ?? e.category,
    kind: e.kind, category: e.category, amount: Number(e.amount ?? 0), source: e.source ?? "manual",
  }));

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    month: `${y}-${pad(m)}`,
    monthLabel: viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    incomeGoal: Number(goalsQ.data?.income_goal ?? 0),
    savingsGoal: Number(goalsQ.data?.savings_goal ?? 0),
    income,
    expenses: totalExpenses,
    business, personal,
    net: income - totalExpenses,
    byCategory,
    recurring,
    recent,
    uncategorizedCount: (expenses as any[]).filter((e) => e.category === "Uncategorized").length,
    live: true,
  };
}

// ── Phase 9: profile (settings) ──────────────────────────────

export interface ProfileInfo {
  fullName: string;
  email: string;
  live: boolean; // false in mock mode
}

export async function getProfile(): Promise<ProfileInfo> {
  if (!hasSupabase()) return { fullName: "Tyeisha", email: "you@example.com", live: false };
  const { s, userId } = await ctx();
  const [{ data: profile }, { data: { user } }] = await Promise.all([
    s.from("profiles").select("full_name").eq("id", userId).single(),
    s.auth.getUser(),
  ]);
  return { fullName: profile?.full_name ?? "", email: user?.email ?? "", live: true };
}
