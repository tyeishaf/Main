import type {
  Contact, DashboardData, PipelineStage, Appointment, ClientListItem, ReportData, BudgetData,
} from "./types";
import { affirmationForToday } from "./affirmations";

/**
 * DATA PROVIDER
 * -------------
 * The UI only ever imports from this file. In Phase 5 each function's
 * body is replaced with Supabase queries (and the AI briefing endpoint)
 * — the component tree does not change.
 */

export const DISPOSITIONS = [
  "New Lead", "Working Lead", "Attempting Contact", "Contacted", "Qualified",
  "Voicemail Left", "Text Sent", "Email Sent", "Not Ready", "Call Back Scheduled",
  "Appointment Scheduled", "Appointment Completed", "Waiting On Documents",
  "Application Started", "Application Submitted", "Policy Issued", "Already Covered",
  "Lost Sale", "Future Opportunity", "DNQ", "Dead Lead", "Wrong Number",
  "Do Not Contact", "Referral", "Existing Client", "Renewal", "Win Back",
] as const;

export const TERMINAL_DISPOSITIONS = new Set([
  "Do Not Contact", "Dead Lead", "DNQ", "Lost Sale", "Wrong Number",
]);

const tasks: DashboardData["tasks"] = [
  { id: "1", contactId: "c1", kind: "call", tag: "followup", name: "Marisol Vega", note: "Day 4 follow-up · family plan, budget ~$450/mo", score: 86, disposition: "Qualified", lastContact: "Call · Tue 2:14p (3 days ago)" },
  { id: "2", contactId: "c2", kind: "call", tag: "followup", name: "Devon Price", note: "Try morning per notes", score: 74, disposition: "Voicemail Left", lastContact: "Voicemail · Tue (3 days ago)" },
  { id: "3", contactId: "c3", kind: "text", tag: "followup", name: "Anita Rowe", note: "Asked for dental quote — send options", score: 81, disposition: "Contacted", lastContact: "Inbound text · Yesterday 4:10p" },
  { id: "4", contactId: "c4", kind: "email", tag: "followup", name: "Bright Path Daycare", note: "Group plan census sheet reminder", score: 68, disposition: "Waiting On Documents", lastContact: "Email · Mon (4 days ago)" },
  { id: "5", contactId: "c5", kind: "birthday", tag: "birthday", name: "Gloria Simmons", note: "Turns 64 today — Medicare window opens next year", score: 90, disposition: "Existing Client", lastContact: "Call · Jun 12 (4 wks ago)" },
  { id: "6", contactId: "c6", kind: "birthday", tag: "birthday", name: "Paul Nguyen", note: "Client since 2024 · send birthday text", score: 55, disposition: "Existing Client", lastContact: "Text · May 30" },
  { id: "7", contactId: "c7", kind: "renewal", tag: "renewal", name: "Harper Family", note: "ACA plan renews Aug 1 · schedule review", score: 88, disposition: "Renewal", lastContact: "Email · Jun 28 (2 wks ago)" },
  { id: "8", contactId: "c8", kind: "cold", tag: "cold", name: "Jess Whitfield", note: "Was 'Not Ready' — check in", score: 62, disposition: "Not Ready", lastContact: "Call · Jun 28 (12 days ago)" },
  { id: "9", contactId: "c9", kind: "cold", tag: "cold", name: "Tomás Rivera", note: "Quote sent, no reply", score: 71, disposition: "Text Sent", lastContact: "Quote emailed · Jul 1 (9 days ago)" },
];

export async function mockDashboardData(): Promise<DashboardData> {
  const now = new Date();
  return {
    userFirstName: "Tyeisha",
    dateLabel: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    affirmation: affirmationForToday(),
    briefing: {
      paragraph:
        "You have 4 follow-ups due, 2 birthdays worth a personal note, the Harper renewal to schedule, and 2 leads about to go cold. Start with Marisol — she's your warmest lead and mornings are her best time.",
      counts: { all: tasks.length, followup: 4, birthday: 2, renewal: 1, cold: 2 },
    },
    mustDo: [
      { id: "m1", title: "Call Gloria Simmons — birthday + Medicare timeline", why: "Turns 64 today; goodwill window", urgent: true },
      { id: "m2", title: "Devon Price callback at 4:00p", why: "You promised this time — he answers after work", urgent: true },
      { id: "m3", title: "Send Bright Path census sheet reminder", why: "Group quote expires Monday", urgent: true },
      { id: "m4", title: "Schedule Harper renewal review", why: "Renews Aug 1 — book before their weekend", urgent: false },
    ],
    metrics: { monthRevenue: "$8,340", monthDelta: "▲ 12%", conversion: "23%", policies: 11 },
    tasks,
    sources: [
      { provider: "vanillasoft", label: "VanillaSoft", status: "Synced 12 min ago · 3 new leads today", live: true },
      { provider: "textdrip", label: "Textdrip", status: "New contacts & replies sync automatically", live: true },
    ],
  };
}

export async function mockContact(id: string): Promise<Contact> {
  const t = tasks.find((x) => x.contactId === id) ?? tasks[0];
  return {
    id,
    name: t.name,
    summaryLine: `Family plan · Score ${t.score}`,
    score: t.score,
    disposition: t.disposition,
    lastContact: t.lastContact,
    timeline: [
      { at: "Today 9:02a", type: "ai", text: "AI summary: Marisol is price-sensitive but motivated — newborn arriving in Oct. Best angle: family plan with strong pediatric coverage." },
      { at: "Tue 2:14p", type: "call", text: "Call · 6 min · Discussed family plan options, wants under $450/mo" },
      { at: "Tue 2:25p", type: "note", text: "Husband self-employed. Check subsidy eligibility." },
      { at: "Mon 11:00a", type: "text", text: "Text sent · intro + scheduling link (opened)" },
      { at: "Sun 6:40p", type: "sys", text: "New lead · Source: Facebook ad 'Family Coverage'" },
    ],
  };
}

export async function mockClients(): Promise<ClientListItem[]> {
  const day = 86_400_000;
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
  const lifecycleFor = (disposition: string): ClientListItem["lifecycle"] =>
    disposition === "Existing Client" || disposition === "Renewal" ? "client"
    : disposition === "Do Not Contact" ? "do_not_contact"
    : "lead";
  const daysAgoFor: Record<string, number> = { "1": 3, "2": 3, "3": 1, "4": 4, "5": 28, "6": 42, "7": 13, "8": 12, "9": 9 };
  return tasks.map((t) => ({
    id: t.contactId,
    name: t.name,
    disposition: t.disposition,
    lifecycle: lifecycleFor(t.disposition),
    score: t.score,
    lastContact: t.lastContact,
    lastContactAt: iso(daysAgoFor[t.id] ?? 7),
    phone: "(404) 555-01" + t.id.padStart(2, "0"),
    email: `${t.name.split(" ")[0].toLowerCase()}@example.com`,
    coverage: t.kind === "renewal" ? "ACA renewal" : t.disposition === "Existing Client" ? "Client" : "Prospect",
  }));
}

export async function mockPipeline(): Promise<PipelineStage[]> {
  return [
    { name: "New", deals: ["Kira B. · Individual", "M. Osei · Dental"] },
    { name: "Contacted", deals: ["D. Price · Family", "J. Whitfield · Supp."] },
    { name: "Quoted", deals: ["A. Rowe · Dental", "T. Rivera · Individual", "Harper Fam · ACA"] },
    { name: "Application", deals: ["Bright Path · Group (8 lives)"] },
    { name: "Issued", deals: ["L. Chen · Life $250k"] },
  ];
}

export async function mockAppointments(): Promise<Appointment[]> {
  return [
    { time: "10:30a", title: "Zoom · Anita Rowe — dental options" },
    { time: "1:00p", title: "Call · Harper family renewal review" },
    { time: "3:30p", title: "New consult · Calendly booking (Kira B.)" },
  ];
}

export async function mockReports(): Promise<ReportData> {
  const now = new Date();
  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toLocaleDateString("en-US", { month: "short" });
  });
  const commissions = [3120, 4050, 3680, 5210, 4890, 6340];
  const sold = [2, 3, 2, 4, 3, 5];
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    generatedLabel: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    headline: {
      monthlyIncome: "$3,240.00",
      ytdIncome: "$27,290.00",
      activePolicies: 11,
      conversion: "62%",
      premiumWritten: "$18,450",
      withdrawnValue: "$2,226",
    },
    trend: monthLabels.map((label, i) => ({ label, income: commissions[i], policies: sold[i] })),
    conversion: { won: 8, lost: 5, open: 0 },
    sources: [
      { source: "USHA import", leads: 9, won: 6, closeRate: 67 },
      { source: "Facebook ad", leads: 31, won: 3, closeRate: 10 },
      { source: "Referral", leads: 12, won: 5, closeRate: 42 },
    ],
    pipeline: [
      { stage: "Quoted", value: 1740, count: 3 },
      { stage: "Application", value: 1200, count: 1 },
    ],
    recentIncome: [
      { id: "i1", amount: "$889.11", paidOn: iso(3) },
      { id: "i2", amount: "$742.50", paidOn: iso(10) },
      { id: "i3", amount: "$1,020.30", paidOn: iso(17) },
    ],
    live: false,
  };
}

export async function mockBudget(): Promise<BudgetData> {
  const now = new Date();
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    incomeGoal: 6000, savingsGoal: 2000,
    income: 3240, expenses: 2740, business: 341, personal: 2399,
    net: 500,
    byCategory: [
      { kind: "personal", category: "Rent", amount: 1100 },
      { kind: "personal", category: "Car/Auto", amount: 473 },
      { kind: "personal", category: "Gas", amount: 214 },
      { kind: "business", category: "Leads", amount: 135 },
      { kind: "personal", category: "Going Out", amount: 168 },
      { kind: "business", category: "Software & Tools", amount: 71 },
      { kind: "personal", category: "Groceries", amount: 132 },
      { kind: "personal", category: "Suki (pet)", amount: 40 },
    ],
    recurring: [
      { id: "r1", label: "Rent", amount: 1100, kind: "personal", category: "Rent" },
      { id: "r2", label: "Car note", amount: 473, kind: "personal", category: "Car/Auto" },
      { id: "r3", label: "VanillaSoft", amount: 135, kind: "business", category: "Leads" },
      { id: "r4", label: "Spotify", amount: 13, kind: "personal", category: "Subscriptions" },
    ],
    recent: [
      { id: "e1", date: "Jun 12", merchant: "ALTAR'D STATE #160 TAMPA FL", kind: "personal", category: "Shopping", amount: 39.76, source: "bank" },
      { id: "e2", date: "Jun 8", merchant: "CAVA SOUTH HOWARD TAMPA FL", kind: "personal", category: "Going Out", amount: 16.23, source: "bank" },
      { id: "e3", date: "Jun 6", merchant: "SPOTIFY USA", kind: "personal", category: "Subscriptions", amount: 13.70, source: "bank" },
    ],
    uncategorizedCount: 2,
    live: false,
  };
}

export async function mockDraftMessage(contactName: string): Promise<string> {
  // Phase 8: replaced by a Claude API call with contact context + tone profile
  return `Hi ${contactName.split(" ")[0]}! It's been a few days since we talked about your coverage. I found two plans in your budget with the benefits you cared about most. Want me to walk you through them? I have openings tomorrow morning. 🌸`;
}
