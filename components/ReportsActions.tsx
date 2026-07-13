"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import { importPolicies, logIncome, deleteIncome } from "@/app/actions";
import type { IncomeRow } from "@/lib/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReportsActions({ recentIncome }: { recentIncome: IncomeRow[] }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "income" | "policies">(null);
  const close = () => setSheet(null);
  const refresh = () => router.refresh();

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => setSheet("income")}
          className="rounded-card bg-plum py-3 text-sm font-medium text-white shadow-soft"
        >
          ＋ Log payout
        </button>
        <button
          onClick={() => setSheet("policies")}
          className="rounded-card border border-champagne bg-white py-3 text-sm font-medium text-plum shadow-soft"
        >
          ⇪ Import policies
        </button>
      </div>

      {/* Recent payouts */}
      {recentIncome.length > 0 && (
        <div className="mt-3 rounded-card bg-white p-4 shadow-soft">
          <div className="mb-1 text-xs uppercase tracking-[0.12em] text-fog">Recent payouts</div>
          <ul className="divide-y divide-[#F3EAE5]">
            {recentIncome.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-mauve">{e.paidOn}</span>
                <span className="flex items-center gap-3">
                  <span className="font-display text-gold">{e.amount}</span>
                  <DeleteBtn id={e.id} onDone={refresh} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheet === "income" && <IncomeSheet onClose={close} onDone={refresh} />}
      {sheet === "policies" && <PolicySheet onClose={close} onDone={refresh} />}
    </>
  );
}

function DeleteBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await deleteIncome(id); onDone(); })}
      disabled={pending}
      className="text-xs text-fog hover:text-rose"
      aria-label="Delete payout"
    >
      ✕
    </button>
  );
}

const INCOME_CATS = ["USHA commission", "Renewal override", "Referral bonus", "Other income"];

function IncomeSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [category, setCategory] = useState(INCOME_CATS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount.replace(/[^0-9.\-]/g, ""));
    if (!(amt > 0)) return setMsg("Enter the payout amount.");
    setBusy(true); setMsg(null);
    const r = await logIncome(amt, paidOn, note, category);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Could not save.");
    if ("offline" in r && r.offline) { setMsg("Sample mode — connect Supabase to save."); return; }
    onDone(); onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Log income</h2>
      <p className="text-xs text-mauve">Your USHA Total Payout — or any other income.</p>
      <label className="mt-4 block text-xs text-mauve">Source</label>
      <select value={category} onChange={(e) => setCategory(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold">
        {INCOME_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="mt-3 block text-xs text-mauve">Amount</label>
      <input
        inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
        placeholder="889.11" autoFocus
        className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
      />
      <label className="mt-3 block text-xs text-mauve">Pay date</label>
      <input
        type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
      />
      <label className="mt-3 block text-xs text-mauve">Note (optional)</label>
      <input
        value={note} onChange={(e) => setNote(e.target.value)} placeholder="week of Jul 1"
        className="mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
      />
      <button onClick={save} disabled={busy} className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60">
        {busy ? "Saving…" : "Save payout"}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </Sheet>
  );
}

function PolicySheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ created: number; updated: number; clients: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setMsg(null);
    start(async () => {
      const r = await importPolicies(text);
      if (!r.ok) { setMsg(r.error ?? "Could not import."); return; }
      if ("offline" in r && r.offline) { setMsg("Sample mode — connect Supabase to import."); return; }
      setResult({ created: r.created, updated: r.updated, clients: r.clients });
      onDone();
    });
  };

  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Import policies</h2>
      {!result ? (
        <>
          <p className="mt-1 text-sm text-mauve">
            Upload your carrier sales report saved as <b>CSV</b> (in Excel: File → Save As → CSV).
          </p>
          <input
            ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="mt-4 w-full rounded-card border-2 border-dashed border-rose bg-blush p-6 text-center disabled:opacity-60"
          >
            <div className="text-2xl text-mauve">⇪</div>
            <div className="mt-1 text-sm font-medium">{pending ? "Importing…" : "Choose your sales report (.csv)"}</div>
          </button>
          <p className="mt-3 text-center text-xs text-fog">
            In Force → active · Withdrawn / Not Taken → tracked as fell-through. Re-uploading updates, never duplicates.
          </p>
        </>
      ) : (
        <div className="mt-3 space-y-2 rounded-card bg-white p-4 text-sm shadow-soft">
          <div><span className="font-display text-lg text-gold">{result.created}</span> policies added</div>
          <div><span className="font-display text-lg text-mauve">{result.updated}</span> updated</div>
          <div><span className="font-display text-lg text-sage">{result.clients}</span> new clients created</div>
        </div>
      )}
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </Sheet>
  );
}
