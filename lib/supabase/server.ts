import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * PHASE 5 (now): uses the service-role key with a fixed DEFAULT_ORG_ID —
 * fine while you are the only user and this code only runs on the server.
 * PHASE 6: replaced by an @supabase/ssr cookie-session client so RLS
 * enforces org isolation per authenticated user. The call sites in
 * lib/data.ts and app/actions.ts do not change.
 *
 * NEVER import this file from a client component.
 */
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Copy .env.example to .env.local and fill in your project keys."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const ORG_ID = () => {
  const id = process.env.DEFAULT_ORG_ID;
  if (!id) throw new Error("Set DEFAULT_ORG_ID in .env.local (see .env.example).");
  return id;
};
