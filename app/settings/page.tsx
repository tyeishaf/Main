import { getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";
import { hasSupabase } from "@/lib/supabase";
import { aiConfigured } from "@/lib/ai/claude";
import { twilioConfigured } from "@/lib/integrations/twilio";
import { gmailConfigured } from "@/lib/integrations/gmail";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
  const profile = await getProfile();
  const integrations = [
    { label: "Supabase (database & auth)", on: hasSupabase(), setup: "SETUP.md · Phase 5–6" },
    { label: "Claude assistant", on: aiConfigured(), setup: "SETUP.md · Phase 8" },
    { label: "Twilio texting", on: twilioConfigured(), setup: "SETUP.md · Phase 7" },
    { label: "Gmail sending", on: gmailConfigured(), setup: "SETUP.md · Phase 7" },
    { label: "Follow-up engine (cron)", on: Boolean(process.env.CRON_SECRET), setup: "SETUP.md · Phase 7" },
    { label: "Lead intake webhook", on: Boolean(process.env.LEADS_WEBHOOK_KEY), setup: "SETUP.md · Phase 7" },
  ];
  return <SettingsClient profile={profile} integrations={integrations} />;
}
