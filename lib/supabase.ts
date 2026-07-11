import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Phase 6: queries run as the signed-in user. RLS enforces org
 * isolation at the database — the app no longer decides who sees what.
 *
 * - ctx()   → session-bound client + the user's org/name (pages & actions)
 * - admin() → service-role client, ONLY for cron jobs & webhooks (Phase 7)
 */

export function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function sessionClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* called from a Server Component — middleware handles refresh */
          }
        },
      },
    }
  );
}

export interface Ctx {
  s: SupabaseClient;
  orgId: string;
  userId: string;
  firstName: string;
}

/** Per-request context, cached so the profile is fetched once per render. */
export const ctx = cache(async (): Promise<Ctx> => {
  const s = sessionClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) throw new Error("Not authenticated"); // middleware should prevent this

  const { data: profile } = await s
    .from("profiles")
    .select("org_id, full_name")
    .eq("id", user.id)
    .single();

  return {
    s,
    orgId: profile?.org_id ?? "",
    userId: user.id,
    firstName: (profile?.full_name ?? "there").split(" ")[0].replace(/^\w/, (c: string) => c.toUpperCase()),
  };
});

/** Service-role client for trusted server jobs (cron, webhooks). Never per-user reads. */
export function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** "3 days ago", "Yesterday 4:10p", "Tue 2:14p" — humanized timestamps. */
export function humanize(iso: string | null): string {
  if (!iso) return "No contact yet";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" AM", "a")
    .replace(" PM", "p");
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) {
    const wd = d.toLocaleDateString("en-US", { weekday: "short" });
    return `${wd} ${time} (${days} days ago)`;
  }
  if (days < 60) {
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${label} (${Math.round(days / 7)} wks ago)`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
