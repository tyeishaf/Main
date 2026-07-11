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

export interface PipelineStage {
  name: string;
  deals: string[];
}

export interface Appointment {
  time: string;
  title: string;
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
