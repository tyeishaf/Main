import { getAppointments } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const items = await getAppointments();
  return (
    <main className="px-5">
      <h1 className="mt-6 font-display text-[26px]">Calendar</h1>
      <p className="text-sm text-mauve">{items.length} appointments today</p>
      <div className="mt-4 space-y-3 pb-8">
        {items.map((i) => (
          <div key={i.time} className="flex items-center gap-3 rounded-card bg-white p-4 shadow-soft">
            <div className="w-[52px] font-display text-gold">{i.time}</div>
            <div className="text-sm">{i.title}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
