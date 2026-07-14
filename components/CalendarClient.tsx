"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarEvent, Appointment } from "@/lib/types";
import { toggleEventDone } from "@/app/actions";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const pad = (n: number) => String(n).padStart(2, "0");
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

export default function CalendarClient({
  month, events, configured, error, appts,
}: {
  month: string; events: CalendarEvent[]; configured: boolean; error?: string; appts: Appointment[];
}) {
  const router = useRouter();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadBlanks = first.getDay(); // 0=Sun
  const todayKey = (() => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })();

  // events grouped by dateKey
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const g = byDate.get(e.dateKey) ?? [];
    g.push(e); byDate.set(e.dateKey, g);
  }

  const [selected, setSelected] = useState<string>(todayKey.startsWith(month) ? todayKey : `${month}-01`);
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <main className="px-4 pb-8">
      {/* Month nav */}
      <div className="mt-6 flex items-center justify-between px-1">
        <button onClick={() => router.push(`/calendar?m=${shiftMonth(month, -1)}`)} className="rounded-full bg-white px-3 py-1 text-mauve shadow-soft">‹</button>
        <h1 className="font-display text-[22px]">{monthLabel}</h1>
        <button onClick={() => router.push(`/calendar?m=${shiftMonth(month, 1)}`)} className="rounded-full bg-white px-3 py-1 text-mauve shadow-soft">›</button>
      </div>

      {!configured && (
        <p className="mt-3 rounded-card bg-white p-3 text-center text-xs text-mauve shadow-soft">
          Connect Google Calendar (SETUP.md · Phase 13) to see your events here.
        </p>
      )}
      {configured && error && (
        <p className="mt-3 rounded-card bg-white p-3 text-center text-xs text-rose shadow-soft">Google says: {error}</p>
      )}

      {/* Grid */}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-fog">
        {WEEK.map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = `${month}-${pad(day)}`;
          const evs = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          const isSel = key === selected;
          const allDone = evs.length > 0 && evs.every((e) => e.done);
          return (
            <button key={i} onClick={() => setSelected(key)}
              className={`flex min-h-[46px] flex-col items-center rounded-xl p-1 ${
                isSel ? "bg-plum text-white" : "bg-white shadow-soft"
              }`}>
              <span className={`text-xs ${isToday && !isSel ? "font-bold text-gold" : ""}`}>{day}</span>
              <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                {evs.slice(0, 4).map((e) => (
                  <span key={e.id} className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: e.done ? "transparent" : e.color, border: e.done ? `1px solid ${isSel ? "#fff" : e.color}` : "none" }} />
                ))}
              </span>
              {allDone && <span className="text-[9px] text-sage">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Selected day's events */}
      <section className="mt-5">
        <h2 className="font-display text-lg">
          {new Date(selected + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        <div className="mt-2 space-y-2">
          {selectedEvents.length === 0 && (
            <p className="rounded-card bg-white p-4 text-sm text-fog shadow-soft">Nothing on this day.</p>
          )}
          {selectedEvents.map((e) => <EventRow key={e.id} e={e} onDone={() => router.refresh()} />)}
        </div>
      </section>

      {/* Today's in-app appointments (if any) */}
      {appts.length > 0 && (
        <section className="mt-5">
          <h2 className="font-display text-lg">Today's appointments</h2>
          <div className="mt-2 space-y-2">
            {appts.map((a) => (
              <div key={a.time + a.title} className="flex items-center gap-3 rounded-card bg-white p-3.5 shadow-soft">
                <div className="w-[52px] font-display text-gold">{a.time}</div>
                <div className="text-sm">{a.title}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function EventRow({ e, onDone }: { e: CalendarEvent; onDone: () => void }) {
  const [done, setDone] = useState(e.done);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !done; setDone(next);
    start(async () => { await toggleEventDone(e.id, next); onDone(); });
  };
  const body = (
    <div className="flex items-start gap-3 rounded-card bg-white p-3.5 shadow-soft">
      <button onClick={(ev) => { ev.preventDefault(); toggle(); }} disabled={pending}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-white ${done ? "bg-sage" : ""}`}
        style={{ borderColor: done ? "#9DAF9A" : e.color }} aria-label="Mark done">
        {done ? "✓" : ""}
      </button>
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${done ? "text-fog line-through" : ""}`}>{e.title}</div>
        <div className="text-xs text-mauve">{e.when}{e.location ? ` · ${e.location}` : ""}</div>
        {e.contactId && <div className="text-xs text-gold">☙ client{e.status ? ` · ${e.status}` : ""}</div>}
      </div>
    </div>
  );
  return e.contactId ? <Link href={`/contacts/${e.contactId}`} className="block">{body}</Link> : body;
}
