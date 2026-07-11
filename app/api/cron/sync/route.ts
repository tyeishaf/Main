import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import { pollSources } from "@/lib/integrations/leadSync";

/** Every 10 min: pull from vendors that can't push (VanillaSoft/Textdrip). */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = admin();
  const { data: orgs } = await s.from("orgs").select("id");
  let imported = 0;
  for (const o of orgs ?? []) imported += await pollSources(s, o.id);
  return NextResponse.json({ imported });
}
