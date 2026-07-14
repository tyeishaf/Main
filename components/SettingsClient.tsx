"use client";

import { useState } from "react";
import type { ProfileInfo, TextdripSettingsView } from "@/lib/data";
import { signOut, updateProfile, saveTextdripSettings } from "@/app/actions";

export default function SettingsClient({
  profile,
  integrations,
  textdrip,
}: {
  profile: ProfileInfo;
  integrations: { label: string; on: boolean; setup: string }[];
  textdrip: TextdripSettingsView;
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

      <TextdripSetup current={textdrip} />

      {profile.live && (
        <button onClick={leave} className="mt-6 w-full py-3 text-sm text-rose">
          Sign out
        </button>
      )}
      <div className="pb-8" />
    </main>
  );
}

const tdInput = "mt-1 w-full rounded-xl border border-[#E9DFDA] bg-cream px-3 py-2.5 text-sm outline-none focus:border-gold";

function TextdripSetup({ current }: { current: TextdripSettingsView }) {
  const [apiKey, setApiKey] = useState("");
  const [campaignId, setCampaignId] = useState(current.campaignId);
  const [endpoint, setEndpoint] = useState(current.endpoint);
  const [sendEndpoint, setSendEndpoint] = useState(current.sendEndpoint);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await saveTextdripSettings({ apiKey, campaignId, endpoint, sendEndpoint });
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Could not save.");
    setMsg("offline" in res && res.offline ? "Sample mode — connect Supabase first." : "Saved ✦ — texts now route through Textdrip.");
  };

  return (
    <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg">Textdrip texting</h2>
        {current.ready && <span className="text-xs font-semibold text-sage">● Connected</span>}
      </div>
      <p className="mt-1 text-xs text-mauve">
        Paste these from your Textdrip account so texts send from Textdrip (with your automations), not your personal number.
      </p>

      <label className="mt-3 block text-xs text-mauve">API key {current.apiKeySet && <span className="text-sage">· saved</span>}</label>
      <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={current.apiKeySet ? "•••••• (leave blank to keep)" : "your Textdrip API key"} className={tdInput} />

      <label className="mt-3 block text-xs text-mauve">Campaign / automation ID</label>
      <input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="fFAxdQr5X7AfuyrD" className={tdInput} />

      <label className="mt-3 block text-xs text-mauve">Add-to-campaign URL</label>
      <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://…/add-to-campaign" className={tdInput} />

      <label className="mt-3 block text-xs text-mauve">Send-SMS URL</label>
      <input value={sendEndpoint} onChange={(e) => setSendEndpoint(e.target.value)} placeholder="https://…/send-sms" className={tdInput} />

      <button onClick={save} disabled={busy} className="mt-4 w-full rounded-full bg-plum py-2.5 text-sm text-white disabled:opacity-60">
        {busy ? "Saving…" : "Save Textdrip settings"}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </section>
  );
}
