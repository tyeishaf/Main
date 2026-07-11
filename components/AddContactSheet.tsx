"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import { addContact } from "@/app/actions";

const inputCls =
  "mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

export default function AddContactSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [coverage, setCoverage] = useState("");
  const [notes, setNotes] = useState("");
  const [enroll, setEnroll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!firstName.trim()) return setMsg("First name is required.");
    setBusy(true); setMsg(null);
    const res = await addContact(
      { firstName, lastName, phone, email, coverageNeeded: coverage, notes },
      enroll
    );
    setBusy(false);
    if (!res.ok) {
      if ("id" in res && res.id) {
        setMsg("Already in your book — taking you there.");
        setTimeout(() => router.push(`/contacts/${res.id}`), 800);
        return;
      }
      return setMsg(res.error ?? "Could not save.");
    }
    if ("offline" in res && res.offline) {
      setMsg("Sample mode — connect Supabase to save contacts.");
      setTimeout(onClose, 1200);
      return;
    }
    if (res.id) router.push(`/contacts/${res.id}`);
    else { router.refresh(); onClose(); }
  };

  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">New contact</h2>
      <p className="text-xs text-mauve">
        Phone or email lets the follow-up engine reach them.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-mauve">First name *</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} autoFocus />
        </div>
        <div>
          <label className="text-xs text-mauve">Last name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
        </div>
      </div>
      <label className="mt-3 block text-xs text-mauve">Phone</label>
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="(404) 555-0123" />
      <label className="mt-3 block text-xs text-mauve">Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="them@example.com" />
      <label className="mt-3 block text-xs text-mauve">Coverage needed</label>
      <input value={coverage} onChange={(e) => setCoverage(e.target.value)} className={inputCls} placeholder="Family plan, dental…" />
      <label className="mt-3 block text-xs text-mauve">Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enroll}
          onChange={(e) => setEnroll(e.target.checked)}
          className="h-4 w-4 accent-plum"
        />
        Enroll in the follow-up sequence (Day-1 call task appears now)
      </label>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Add contact"}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </Sheet>
  );
}
