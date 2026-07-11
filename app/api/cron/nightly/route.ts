import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import { scoreLeads } from "@/lib/ai/scoring";

/** Nightly: re-score leads (deterministic base + Claude signal). */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = admin();
  const { data: orgs } = await s.from("orgs").select("id");
  let scored = 0;
  for (const o of orgs ?? []) scored += await scoreLeads(s, o.id);
  return NextResponse.json({ scored });
}
