import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase";
import { upsertLead, normalizePayload } from "@/lib/integrations/leadSync";

/**
 * UNIVERSAL LEAD WEBHOOK — point anything here:
 *   POST <app>/api/webhooks/leads?key=<LEADS_WEBHOOK_KEY>&source=vanillasoft
 * Works with VanillaSoft/Textdrip native webhooks, Zapier, Make,
 * Facebook Lead Ads via Zapier, or your own forms. Accepts a JSON
 * object or an array. Field names auto-normalized. New leads are
 * deduped, filed with source attribution, and enrolled in the
 * default sequence within seconds of arriving.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== process.env.LEADS_WEBHOOK_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const source = `webhook:${url.searchParams.get("source") ?? "unknown"}`;

  let payload: any;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const s = admin();
  // Single-operator: leads land in the first org. Multi-org routing
  // arrives with agency features (per-org webhook keys).
  const { data: org } = await s.from("orgs").select("id").limit(1).single();
  if (!org) return NextResponse.json({ error: "no org" }, { status: 500 });

  const rows: any[] = Array.isArray(payload) ? payload : [payload];
  let created = 0, merged = 0;
  for (const r of rows) {
    const res = await upsertLead(s, org.id, normalizePayload(r, source));
    res.created ? created++ : merged++;
  }
  return NextResponse.json({ ok: true, created, merged });
}
