import { getDashboardData } from "@/lib/data";
import DashboardClient from "@/components/DashboardClient";

/**
 * Server component: one data fetch, streamed to the client shell.
 * In Phase 5 getDashboardData() hits Supabase; in Phase 8 the briefing
 * paragraph and affirmation come from the nightly Claude job.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
