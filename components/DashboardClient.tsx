"use client";

import { useState } from "react";
import type { DashboardData, TaskItem, TaskTag } from "@/lib/types";
import MustDoList from "./MustDoList";
import HitList from "./HitList";
import TaskCard from "./TaskCard";
import DraftSheet from "./DraftSheet";
import ImportSheet from "./ImportSheet";
import { signOut } from "@/app/actions";

type Filter = "all" | TaskTag;

const CHIPS: { key: Filter; label: string; activeClass: string }[] = [
  { key: "all", label: "All", activeClass: "bg-mauve border-mauve" },
  { key: "followup", label: "Follow-ups", activeClass: "bg-rose border-rose" },
  { key: "birthday", label: "Birthdays", activeClass: "bg-gold border-gold" },
  { key: "renewal", label: "Renewal", activeClass: "bg-gold border-gold" },
  { key: "cold", label: "Going cold", activeClass: "bg-sage border-sage" },
];

export default function DashboardClient({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [draftTask, setDraftTask] = useState<TaskItem | null>(null);
  const [importing, setImporting] = useState(false);

  const shown = data.tasks.filter((t) => filter === "all" || t.tag === filter);
  const countFor = (f: Filter) =>
    f === "all" ? data.briefing.counts.all : data.briefing.counts[f];

  return (
    <main className="px-5">
      {/* Header */}
      <div className="mt-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold">{data.dateLabel}</p>
          <h1 className="mt-1 font-display text-3xl font-medium">
            Good morning, {data.userFirstName}
          </h1>
        </div>
        <button
          onClick={() => setImporting(true)}
          className="mt-1 flex items-center gap-1.5 rounded-full border border-champagne bg-white px-3.5 py-2 text-xs shadow-soft"
        >
          <span className="text-gold">⇪</span> Import leads
        </button>
      </div>

      {/* Daily affirmation */}
      <p className="mt-3 border-l-2 border-gold pl-3 font-display italic text-[15.5px] leading-relaxed text-mauve">
        {data.affirmation}
      </p>

      {/* Briefing — the assistant's morning note */}
      <section className="mt-4 rounded-3xl bg-gradient-to-br from-blush to-[#FBF3EE] p-5 shadow-soft">
        <div className="mb-3 h-px w-10 bg-gold" />
        <p className="font-display italic text-[17px] leading-relaxed">
          {data.briefing.paragraph}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  active ? `${c.activeClass} text-white shadow-soft` : "border-[#E9DFDA] bg-white text-plum"
                }`}
              >
                <span className="font-display font-semibold">{countFor(c.key)}</span>{" "}
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <MustDoList items={data.mustDo} />

      {/* Metrics */}
      <div className="mt-4 flex gap-3">
        <Metric label="This month" value={data.metrics.monthRevenue} sub={data.metrics.monthDelta} />
        <Metric label="Conversion" value={data.metrics.conversion} />
        <Metric label="Policies" value={String(data.metrics.policies)} />
      </div>

      <HitList tasks={data.tasks} />

      {/* Today feed */}
      <h2 className="mt-6 mb-2 font-display text-xl">Today</h2>
      <div className="space-y-3">
        {shown.map((t) => (
          <TaskCard key={t.id} task={t} onDraft={() => setDraftTask(t)} />
        ))}
        {shown.length === 0 && (
          <p className="rounded-card bg-white p-4 text-sm text-mauve shadow-soft">
            Nothing here — pick another filter or enjoy the quiet.
          </p>
        )}
      </div>

      <button
        onClick={() => signOut().then(() => (location.href = "/login"))}
        className="mx-auto mt-8 block pb-4 text-xs text-fog"
      >
        Sign out
      </button>

      {draftTask && <DraftSheet task={draftTask} onClose={() => setDraftTask(null)} />}
      {importing && <ImportSheet sources={data.sources} onClose={() => setImporting(false)} />}
    </main>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 rounded-card bg-white p-3 text-center shadow-soft">
      <div className="font-display text-[22px]">{value}</div>
      <div className="text-xs text-mauve">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-gold">{sub}</div>}
    </div>
  );
}
