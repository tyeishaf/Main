import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import {
  generateBirthdayTasks, generateRenewalTasks, generateColdLeadTasks,
} from "@/lib/engine/generators";
import { generateMorningBriefing } from "@/lib/ai/briefing";

/** Daily 6am: birthdays, renewals (≤30 days), cold-lead rescues. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = admin();
  const [birthdays, renewals, cold] = await Promise.all([
    generateBirthdayTasks(s), generateRenewalTasks(s), generateColdLeadTasks(s),
  ]);
  // Briefing runs AFTER generators so it narrates the finished day plan
  const { data: orgs } = await s.from("orgs").select("id");
  let briefings = 0;
  for (const o of orgs ?? []) {
    if (await generateMorningBriefing(s, o.id)) briefings++;
  }
  return NextResponse.json({ birthdays, renewals, cold, briefings });
}
