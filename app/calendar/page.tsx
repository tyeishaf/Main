import Link from "next/link";
import { getAppointments, getCalendarEvents } from "@/lib/data";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [items, cal] = await Promise.all([getAppointments(), getCalendarEvents()]);

  // group Google events by day, preserving order
  const byDay: { day: string; events: CalendarEvent[] }[] = [];
  for (const e of cal.events) {
    let g = byDay.find((x) => x.day === e.day);
    if (!g) { g = { day: e.day, events: [] }; byDay.push(g); }
    g.events.push(e);
  }

  return (
    <main className="px-5 pb-8">
      <h1 className="mt-6 font-display text-[26px]">Calendar</h1>

      {/* Today (from the app's own appointments) */}
      <p className="mt-1 text-sm text-mauve">{items.length} appointment{items.length === 1 ? "" : "s"} today</p>
      <div className="mt-3 space-y-2">
        {items.map((i) => (
          <div key={i.time + i.title} className="flex items-center gap-3 rounded-card bg-white p-4 shadow-soft">
            <div className="w-[52px] font-display text-gold">{i.time}</div>
            <div className="text-sm">{i.title}</div>
          </div>
        ))}
      </div>

      {/* Google Calendar */}
      {cal.configured ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl">Upcoming</h2>
            <span className="text-xs text-gold">Google Calendar</span>
          </div>
          {byDay.length === 0 ? (
            <div className="mt-3 rounded-card bg-white p-4 text-sm text-mauve shadow-soft">
              <p>Nothing scheduled in the next 6 weeks.</p>
              {cal.error && (
                <p className="mt-2 text-xs text-rose">Google says: {cal.error}</p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {byDay.map((g) => (
                <div key={g.day}>
                  <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-fog">{g.day}</div>
                  <div className="space-y-2">
                    {g.events.map((e) => {
                      const body = (
                        <div className="flex items-start gap-3 rounded-card bg-white p-3.5 shadow-soft">
                          <div className="w-[64px] shrink-0 font-display text-sm text-gold">{e.when}</div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{e.title}</div>
                            {e.location && <div className="truncate text-xs text-fog">{e.location}</div>}
                            {e.contactId && (
                              <div className="mt-0.5 text-xs text-mauve">
                                ☙ client{e.status ? ` · ${e.status}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                      return e.contactId
                        ? <Link key={e.id} href={`/contacts/${e.contactId}`} className="block">{body}</Link>
                        : <div key={e.id}>{body}</div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-soft">
          <h2 className="font-display text-lg">Connect Google Calendar</h2>
          <p className="mt-1 text-sm text-mauve">
            Link your Google Calendar to see client appointments here, matched to their records. One-time setup — see the
            Google Calendar section in <b>SETUP.md</b> (add <code className="text-xs">GOOGLE_CALENDAR_REFRESH_TOKEN</code> in Vercel).
          </p>
        </section>
      )}
    </main>
  );
}
