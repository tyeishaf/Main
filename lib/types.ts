/**
 * Domain types — deliberately mirror the Phase 2 Postgres schema
 * so the Phase 5 swap to Supabase generated types is mechanical.
 */

export type TaskKind = "call" | "text" | "email" | "birthday" | "renewal" | "cold";
export type TaskTag = "followup" | "birthday" | "renewal" | "cold";

export interface TaskItem {
  id: string;
  kind: TaskKind;
  tag: TaskTag;
  contactId: string;
  name: string;
  note: string;
  score: number;           // 0–100 lead score
  disposition: string;
  lastContact: string;     // humanized; raw timestamptz in DB
}

export interface MustDoItem {
  id: string;
  title: string;
  why: string;
  urgent: boolean;
}

export interface TimelineEvent {
  at: string;
  type: "call" | "text" | "email" | "note" | "ai" | "sys";
  text: string;
}

export interface Contact {
  id: string;
  name: string;
  summaryLine: string;     // e.g. "Family plan · Score 86"
  score: number;
  disposition: string;
  lastContact: string;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  location: string | null; // "City, ST 12345"
  notes: string | null;
  dob: string | null;      // "yyyy-mm-dd" for editing
  birthday: string | null; // "Oct 17"
  age: number | null;
  clientType: "individual" | "business";
  leadSource: string | null;    // where it was imported from
  importStatus: string | null;  // disposition it had at upload
  timeline: TimelineEvent[];
}

export interface Metrics {
  monthRevenue: string;
  monthDelta: string;
  conversion: string;
  policies: number;
}

export interface Briefing {
  paragraph: string;       // AI-written morning note
  counts: { all: number; followup: number; birthday: number; renewal: number; cold: number };
}

export interface LeadSource {
  provider: "vanillasoft" | "textdrip" | "csv";
  label: string;
  status: string;
  live: boolean;
}

export type ClientFilter = "all" | "leads" | "clients" | "business" | "hot" | "quiet" | "dnc";

/** One row in the Clients directory (Phase 9). */
export interface ClientListItem {
  id: string;
  name: string;
  disposition: string;
  lifecycle: "lead" | "prospect" | "client" | "lapsed" | "do_not_contact";
  score: number;
  lastContact: string;          // humanized
  lastContactAt: string | null; // raw ISO, drives "gone quiet" sorting
  phone: string | null;
  email: string | null;
  coverage: string;             // e.g. "Individual, dental" or "Prospect"
  clientType: "individual" | "business";
}

export interface PipelineStage {
  name: string;
  deals: string[];
}

export interface Appointment {
  time: string;
  title: string;
}

/** A Google Calendar event, optionally linked to a client (Phase 13). */
export interface CalendarEvent {
  id: string;
  title: string;
  day: string;          // "Mon, Jul 14"
  when: string;         // "2:30 PM" or "All day"
  location: string | null;
  contactId: string | null;  // matched client, if any
  status: string | null;     // that client's disposition
}

/** Reporting (Phase 10/11) — income from the payout log, policies from the carrier import. */
export interface MonthPoint {
  label: string;          // "Jul"
  income: number;         // take-home logged that month ($)
  policies: number;       // policies that became active that month
}

export interface SourceRow {
  source: string;         // "USHA import", "Facebook ad", …
  leads: number;
  won: number;            // became a client with an active policy
  closeRate: number;      // 0–100
}

export interface StageValue {
  stage: string;
  value: number;          // monthly premium in play ($)
  count: number;
}

export interface IncomeRow {
  id: string;
  amount: string;         // "$889.11"
  paidOn: string;         // "Jul 5"
}

export interface ReportData {
  generatedLabel: string;         // "Saturday, July 11"
  headline: {
    monthlyIncome: string;        // take-home this calendar month
    ytdIncome: string;            // take-home year to date
    activePolicies: number;
    conversion: string;           // clients placed / clients written
    premiumWritten: string;       // in-force premium (active policies)
    withdrawnValue: string;       // value of Withdrawn/Not-Taken policies (exposure)
  };
  trend: MonthPoint[];            // oldest → newest, last 6 months
  conversion: { won: number; lost: number; open: number };
  sources: SourceRow[];          // top sources by lead volume
  pipeline: StageValue[];        // premium in play by stage
  recentIncome: IncomeRow[];     // latest payout log entries
  live: boolean;                 // false in mock mode
}

/** Budget (Phase 12) — business + personal expenses vs income & goals. */
export interface BudgetCatRow { kind: "business" | "personal"; category: string; amount: number; }
export interface ExpenseRow2 { id: string; date: string; merchant: string; kind: string; category: string; amount: number; source: string; }
export interface RecurringRow { id: string; label: string; amount: number; kind: string; category: string; }

export interface BudgetData {
  month: string;           // "YYYY-MM" being viewed
  monthLabel: string;
  incomeGoal: number;
  savingsGoal: number;
  income: number;          // this month (all sources)
  expenses: number;        // this month: logged/imported + recurring
  business: number;
  personal: number;
  net: number;             // income − expenses (= saved this month)
  byCategory: BudgetCatRow[];
  recurring: RecurringRow[];
  recent: ExpenseRow2[];
  uncategorizedCount: number;
  live: boolean;
}

/** The dashboard's full data contract — one server fetch, passed down. */
export interface DashboardData {
  userFirstName: string;
  dateLabel: string;
  affirmation: string;
  briefing: Briefing;
  mustDo: MustDoItem[];
  metrics: Metrics;
  tasks: TaskItem[];
  sources: LeadSource[];
}
