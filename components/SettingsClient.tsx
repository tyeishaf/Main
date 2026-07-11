"use client";

import { useState } from "react";
import type { ProfileInfo } from "@/lib/data";
import { signOut, updateProfile } from "@/app/actions";

export default function SettingsClient({
  profile,
  integrations,
}: {
  profile: ProfileInfo;
  integrations: { label: string; on: boolean; setup: string }[];
}) {
  const [name, setName] = useState(profile.fullName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await updateProfile(name);
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Could not save.");
    setMsg(res.offline ? "Sample mode — connect Supabase to save." : "Saved ✦");
  };

  const leave = async () => {
    await signOut();
    location.href = "/login";
  };

  return (
    <main className="px-5">
      <h1 className="mt-6 font-display text-[26px]">Settings</h1>

      <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg">Profile</h2>
        <label className="mt-3 block text-xs text-mauve">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold"
        />
        <p className="mt-1 text-xs text-fog">
          The dashboard greets you by first name. Signed in as {profile.email}.
        </p>
        <button
          onClick={save}
          disabled={busy}
          className="mt-3 w-full rounded-full bg-plum py-2.5 text-sm text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
      </section>

      <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg">Connections</h2>
        <ul className="mt-2 divide-y divide-[#F3EAE5]">
          {integrations.map((i) => (
            <li key={i.label} className="flex items-center justify-between py-2.5 text-sm">
              <span>{i.label}</span>
              {i.on ? (
                <span className="text-xs font-semibold text-sage">● Connected</span>
              ) : (
                <span className="text-xs text-fog">○ {i.setup}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {profile.live && (
        <button onClick={leave} className="mt-6 w-full py-3 text-sm text-rose">
          Sign out
        </button>
      )}
      <div className="pb-8" />
    </main>
  );
}
