import { getAppointments, getCalendarEvents } from "@/lib/data";
import CalendarClient from "@/components/CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: { m?: string } }) {
  const [items, cal] = await Promise.all([getAppointments(), getCalendarEvents(searchParams.m)]);
  const now = new Date();
  const month = searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m)
    ? searchParams.m
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return <CalendarClient month={month} events={cal.events} configured={cal.configured} error={cal.error} appts={items} />;
}
