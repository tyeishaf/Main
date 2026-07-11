"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Login — password sign-in/up plus a magic-link option.
 * Kept as one elegant card in the house style.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const submit = async () => {
    setBusy(true); setMsg(null);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email, password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "signup") return setMsg("Check your email to confirm your account.");
    location.href = "/";
  };

  const magicLink = async () => {
    if (!email) return setMsg("Enter your email first.");
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    setMsg(error ? error.message : "Magic link sent — check your email.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-gold">Advisory CRM</p>
        <h1 className="mt-1 text-center font-display text-3xl font-medium">Welcome back</h1>
        <p className="mt-1 text-center font-display italic text-[15px] text-mauve">
          Your day is already organized.
        </p>

        <div className="mt-6 rounded-3xl bg-white p-6 shadow-soft">
          <label className="text-xs text-mauve">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="you@example.com"
          />
          <label className="mt-3 block text-xs text-mauve">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="••••••••"
          />

          <button
            onClick={submit}
            disabled={busy}
            className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60"
          >
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button
            onClick={magicLink}
            disabled={busy}
            className="mt-2 w-full rounded-full bg-champagne py-3 text-sm text-gold disabled:opacity-60"
          >
            Email me a magic link ✦
          </button>

          {msg && <p className="mt-3 text-center text-xs text-mauve">{msg}</p>}
        </div>

        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
          className="mt-4 w-full text-center text-sm text-mauve"
        >
          {mode === "signin" ? "First time? Create your account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
