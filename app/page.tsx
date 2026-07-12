import { getDashboardData } from "@/lib/data";
import DashboardClient from "@/components/DashboardClient";

// Always render per-request against the live database (never a build-time
// snapshot) — otherwise the mock-mode fallback can get frozen into a static page.
export const dynamic = "force-dynamic";

/**
 * Server component: one data fetch, streamed to the client shell.
 * In Phase 5 getDashboardData() hits Supabase; in Phase 8 the briefing
 * paragraph and affirmation come from the nightly Claude job.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
