import { getProfile, getTextdripSettings } from "@/lib/data";

export const dynamic = "force-dynamic";
import { hasSupabase } from "@/lib/supabase";
import { aiConfigured } from "@/lib/ai/claude";
import { twilioConfigured } from "@/lib/integrations/twilio";
import { gmailConfigured } from "@/lib/integrations/gmail";
import { calendarConfigured } from "@/lib/integrations/googleCalendar";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
  const [profile, textdrip] = await Promise.all([getProfile(), getTextdripSettings()]);
  const integrations = [
    { label: "Supabase (database & auth)", on: hasSupabase(), setup: "SETUP.md · Phase 5–6" },
    { label: "Claude assistant", on: aiConfigured(), setup: "SETUP.md · Phase 8" },
    { label: "Textdrip texting", on: textdrip.ready, setup: "set up below" },
    { label: "Google Calendar", on: calendarConfigured(), setup: "SETUP.md · Phase 13" },
    { label: "Gmail sending", on: gmailConfigured(), setup: "SETUP.md · Phase 7" },
    { label: "Twilio texting", on: twilioConfigured(), setup: "SETUP.md · Phase 7" },
    { label: "Follow-up engine (cron)", on: Boolean(process.env.CRON_SECRET), setup: "SETUP.md · Phase 7" },
  ];
  return <SettingsClient profile={profile} integrations={integrations} textdrip={textdrip} />;
}
