import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import { tick } from "@/lib/engine/sequences";

/** Every 15 min: materialize due sequence steps. Protected by CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await tick(admin());
  return NextResponse.json(result);
}
