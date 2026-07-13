"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";
import type { BudgetData } from "@/lib/types";
import {
  importExpenses, logExpense, deleteExpense, updateExpenseCategory,
  addRecurring, deleteRecurring, saveBudgetGoals,
} from "@/app/actions";

const BUSINESS_CATS = [
  "Leads", "Marketing", "Software & Tools", "Licensing & E&O", "Office Supplies",
  "Auto & Travel", "Continuing Education", "Professional Dues", "Client Meals",
  "Phone & Internet", "Bank Fees", "Other (Business)",
];
const PERSONAL_CATS = [
  "Rent", "Car/Auto", "Gas", "Groceries", "Going Out", "Personal Care", "Shopping",
  "Home Decor", "Cleaning Supplies", "Suki (pet)", "Gym", "Phone", "Utilities",
  "Health/Medical", "Subscriptions", "Credit Card/Debt", "Savings", "Uncategorized", "Other (Personal)",
];

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function BudgetClient({ data }: { data: BudgetData }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [sheet, setSheet] = useState<null | "expense" | "import" | "recurring" | "goals">(null);
  const close = () => setSheet(null);

  const spendCap = data.incomeGoal - data.savingsGoal; // e.g. 6000 − 2000 = 4000
  const savedPct = data.savingsGoal ? Math.min(100, Math.max(0, (data.net / data.savingsGoal) * 100)) : 0;
  const incomePct = data.incomeGoal ? Math.min(100, (data.income / data.incomeGoal) * 100) : 0;
  const spendPct = spendCap > 0 ? Math.min(100, (data.expenses / spendCap) * 100) : 0;

  return (
    <main className="px-5 pb-8">
      <div className="mt-6 flex items-baseline justify-between">
        <h1 className="font-display text-[26px]">Budget</h1>
        <button onClick={() => setSheet("goals")} className="text-xs text-gold">edit goals</button>
      </div>
      {/* Month navigator */}
      <div className="mt-2 flex items-center justify-between">
        <button onClick={() => router.push(`/budget?m=${shiftMonth(data.month, -1)}`)} className="rounded-full bg-white px-3 py-1 text-sm text-mauve shadow-soft" aria-label="Previous month">‹</button>
        <span className="font-display text-[15px]">{data.monthLabel}</span>
        <button onClick={() => router.push(`/budget?m=${shiftMonth(data.month, 1)}`)} className="rounded-full bg-white px-3 py-1 text-sm text-mauve shadow-soft" aria-label="Next month">›</button>
      </div>
      {!data.live && <p className="mt-1 text-xs text-mauve">Sample data — connect Supabase to see your real numbers.</p>}

      {/* Actions */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => setSheet("import")} className="rounded-card bg-plum py-3 text-xs font-medium text-white shadow-soft">⇪ Import bank</button>
        <button onClick={() => setSheet("expense")} className="rounded-card border border-champagne bg-white py-3 text-xs font-medium text-plum shadow-soft">＋ Expense</button>
        <button onClick={() => setSheet("recurring")} className="rounded-card border border-champagne bg-white py-3 text-xs font-medium text-plum shadow-soft">🔁 Fixed bills</button>
      </div>

      {/* This month summary */}
      <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="font-display text-[20px] text-gold">{usd(data.income)}</div><div className="text-xs text-mauve">Income</div></div>
          <div><div className="font-display text-[20px] text-rose">{usd(data.expenses)}</div><div className="text-xs text-mauve">Spent</div></div>
          <div><div className={`font-display text-[20px] ${data.net >= 0 ? "text-sage" : "text-rose"}`}>{usd(data.net)}</div><div className="text-xs text-mauve">Saved</div></div>
        </div>
        <p className="mt-3 text-xs text-fog">
          Business {usd(data.business)} · Personal {usd(data.personal)}
        </p>
      </section>

      {/* Goals */}
      <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
        <Bar label={`Income goal ${usd(data.incomeGoal)}`} value={`${usd(data.income)} (${Math.round(incomePct)}%)`} pct={incomePct} color="bg-gold" />
        <div className="mt-3"><Bar label={`Savings goal ${usd(data.savingsGoal)}`} value={`${usd(Math.max(0, data.net))} (${Math.round(savedPct)}%)`} pct={savedPct} color="bg-sage" /></div>
        {spendCap > 0 && (
          <div className="mt-3">
            <Bar label={`Spending budget ${usd(spendCap)}`} value={`${usd(data.expenses)} (${Math.round(spendPct)}%)`} pct={spendPct} color={spendPct > 100 ? "bg-rose" : "bg-mauve"} />
            <p className="mt-1 text-xs text-fog">To save {usd(data.savingsGoal)} on {usd(data.incomeGoal)}, keep spending under {usd(spendCap)}.</p>
          </div>
        )}
      </section>

      {/* Category breakdown */}
      <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg">Where it goes</h2>
        {data.byCategory.length === 0 ? (
          <p className="mt-2 text-sm text-fog">No spending yet — import a bank statement or add an expense.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {data.byCategory.map((c) => {
              const max = data.byCategory[0].amount || 1;
              return (
                <div key={`${c.kind}-${c.category}`}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="truncate">
                      {c.category}
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${c.kind === "business" ? "bg-champagne text-gold" : "bg-blush text-mauve"}`}>{c.kind === "business" ? "biz" : "pers"}</span>
                    </span>
                    <span className="ml-2 shrink-0 font-display">{usd(c.amount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                    <div className={`h-full rounded-full ${c.kind === "business" ? "bg-gold/70" : "bg-mauve/60"}`} style={{ width: `${(c.amount / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Uncategorized nudge */}
      {data.uncategorizedCount > 0 && (
        <p className="mt-3 rounded-card bg-champagne p-3 text-sm text-plum">
          ✦ {data.uncategorizedCount} imported {data.uncategorizedCount === 1 ? "purchase needs" : "purchases need"} a category — tap any below to fix.
        </p>
      )}

      {/* Recent expenses */}
      {data.recent.length > 0 && (
        <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
          <h2 className="font-display text-lg">Recent</h2>
          <ul className="mt-2 divide-y divide-[#F3EAE5]">
            {data.recent.map((e) => (
              <RecentRow key={e.id} e={e} onDone={refresh} />
            ))}
          </ul>
        </section>
      )}

      {sheet === "import" && <ImportSheet onClose={close} onDone={refresh} />}
      {sheet === "expense" && <ExpenseSheet onClose={close} onDone={refresh} />}
      {sheet === "recurring" && <RecurringSheet data={data} onClose={close} onDone={refresh} />}
      {sheet === "goals" && <GoalsSheet data={data} onClose={close} onDone={refresh} />}
    </main>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span>{label}</span><span className="text-xs text-mauve">{value}</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-cream"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function RecentRow({ e, onDone }: { e: BudgetData["recent"][number]; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const cats = e.kind === "business" ? BUSINESS_CATS : PERSONAL_CATS;
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{e.merchant}</div>
          <button onClick={() => setEditing(!editing)} className="text-xs text-mauve underline-offset-2 hover:underline">
            {e.date} · {e.category} {e.category === "Uncategorized" ? "⚠︎" : ""}
          </button>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-display">{usd2(e.amount)}</span>
          <button onClick={() => start(async () => { await deleteExpense(e.id); onDone(); })} disabled={pending} className="text-xs text-fog hover:text-rose">✕</button>
        </span>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["personal", "business"].map((k) => (
            <select key={k} defaultValue="" onChange={(ev) => { if (ev.target.value) start(async () => { await updateExpenseCategory(e.id, k, ev.target.value); onDone(); }); }}
              className="rounded-lg border border-[#E9DFDA] bg-cream px-2 py-1 text-xs">
              <option value="">{k === "business" ? "→ Business…" : "→ Personal…"}</option>
              {(k === "business" ? BUSINESS_CATS : PERSONAL_CATS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ))}
        </div>
      )}
    </li>
  );
}

const inputCls = "mt-1 w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

function ExpenseSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState("personal"); const [category, setCategory] = useState("Groceries");
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const cats = kind === "business" ? BUSINESS_CATS : PERSONAL_CATS;
  const save = async () => {
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    if (!(amt > 0)) return setMsg("Enter an amount.");
    setBusy(true); setMsg(null);
    const r = await logExpense(amt, date, kind, category, note);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Could not save.");
    onDone(); onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Add an expense</h2>
      <label className="mt-3 block text-xs text-mauve">Amount</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="24.99" className={inputCls} autoFocus />
      <label className="mt-3 block text-xs text-mauve">Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      <div className="mt-3 flex gap-2">
        {["personal", "business"].map((k) => (
          <button key={k} onClick={() => { setKind(k); setCategory(k === "business" ? "Software & Tools" : "Groceries"); }}
            className={`flex-1 rounded-full py-2 text-sm ${kind === k ? "bg-plum text-white" : "bg-white text-mauve shadow-soft"}`}>{k === "business" ? "Business" : "Personal"}</button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-mauve">Category</label>
      <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="mt-3 block text-xs text-mauve">Note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      <button onClick={save} disabled={busy} className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60">{busy ? "Saving…" : "Save expense"}</button>
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </Sheet>
  );
}

function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ added: number; skipped: number; uncategorized: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const onFile = async (file: File) => {
    const text = await file.text(); setMsg(null);
    start(async () => {
      const r = await importExpenses(text);
      if (!r.ok) return setMsg(r.error ?? "Could not import.");
      if ("offline" in r && r.offline) return setMsg("Sample mode — connect Supabase to import.");
      setRes({ added: r.added, skipped: r.skipped, uncategorized: r.uncategorized }); onDone();
    });
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Import bank statement</h2>
      {!res ? (
        <>
          <p className="mt-1 text-sm text-mauve">Upload a transactions <b>CSV</b> (Date, Description, Amount). Purchases get auto-categorized; transfers &amp; deposits are skipped.</p>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={pending} className="mt-4 w-full rounded-card border-2 border-dashed border-rose bg-blush p-6 text-center disabled:opacity-60">
            <div className="text-2xl text-mauve">⇪</div>
            <div className="mt-1 text-sm font-medium">{pending ? "Importing…" : "Choose transactions .csv"}</div>
          </button>
          <p className="mt-3 text-center text-xs text-fog">Re-uploading overlapping statements won't double anything.</p>
        </>
      ) : (
        <div className="mt-3 space-y-2 rounded-card bg-white p-4 text-sm shadow-soft">
          <div><span className="font-display text-lg text-gold">{res.added}</span> purchases added</div>
          <div><span className="font-display text-lg text-mauve">{res.skipped}</span> skipped (transfers, deposits, duplicates)</div>
          <div><span className="font-display text-lg text-rose">{res.uncategorized}</span> need a category — fix them in the Recent list</div>
          <p className="mt-2 text-xs text-fog">Purchases land in the month they happened — use the ‹ › arrows at the top to view April, May, June, etc.</p>
        </div>
      )}
      {msg && <p className="mt-2 text-center text-xs text-mauve">{msg}</p>}
    </Sheet>
  );
}

function RecurringSheet({ data, onClose, onDone }: { data: BudgetData; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(""); const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("personal"); const [category, setCategory] = useState("Rent");
  const [busy, setBusy] = useState(false); const [pending, start] = useTransition();
  const cats = kind === "business" ? BUSINESS_CATS : PERSONAL_CATS;
  const add = async () => {
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    if (!label.trim() || !(amt > 0)) return;
    setBusy(true);
    await addRecurring(label, amt, kind, category);
    setBusy(false); setLabel(""); setAmount(""); onDone();
  };
  const total = data.recurring.reduce((a, r) => a + r.amount, 0);
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Fixed monthly bills</h2>
      <p className="text-xs text-mauve">These auto-count every month. Total: {usd(total)}/mo.</p>
      <ul className="mt-3 divide-y divide-[#F3EAE5]">
        {data.recurring.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <span>{r.label} <span className="text-xs text-fog">· {r.category}</span></span>
            <span className="flex items-center gap-3"><span className="font-display">{usd(r.amount)}</span>
              <button onClick={() => start(async () => { await deleteRecurring(r.id); onDone(); })} disabled={pending} className="text-xs text-fog hover:text-rose">✕</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-card bg-cream p-3">
        <div className="text-xs uppercase tracking-[0.12em] text-fog">Add a bill</div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rent" className={inputCls} />
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1100" className={inputCls} />
        <div className="mt-2 flex gap-2">
          {["personal", "business"].map((k) => (
            <button key={k} onClick={() => { setKind(k); setCategory(k === "business" ? "Software & Tools" : "Rent"); }}
              className={`flex-1 rounded-full py-1.5 text-xs ${kind === k ? "bg-plum text-white" : "bg-white text-mauve shadow-soft"}`}>{k === "business" ? "Business" : "Personal"}</button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={add} disabled={busy} className="mt-3 w-full rounded-full bg-plum py-2.5 text-sm text-white disabled:opacity-60">{busy ? "Adding…" : "Add bill"}</button>
      </div>
    </Sheet>
  );
}

function GoalsSheet({ data, onClose, onDone }: { data: BudgetData; onClose: () => void; onDone: () => void }) {
  const [income, setIncome] = useState(String(data.incomeGoal || ""));
  const [savings, setSavings] = useState(String(data.savingsGoal || ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await saveBudgetGoals(Number(income.replace(/[^0-9.]/g, "")) || 0, Number(savings.replace(/[^0-9.]/g, "")) || 0);
    setBusy(false); onDone(); onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl">Monthly goals</h2>
      <label className="mt-3 block text-xs text-mauve">Income goal</label>
      <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="6000" className={inputCls} />
      <label className="mt-3 block text-xs text-mauve">Savings goal</label>
      <input inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="2000" className={inputCls} />
      <button onClick={save} disabled={busy} className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60">{busy ? "Saving…" : "Save goals"}</button>
    </Sheet>
  );
}
