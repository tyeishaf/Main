"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientFilter, ClientListItem } from "@/lib/types";
import AddContactSheet from "./AddContactSheet";
import Sheet from "./Sheet";
import { deleteContacts } from "@/app/actions";

const CHIPS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "leads", label: "Leads" },
  { key: "clients", label: "Clients" },
  { key: "business", label: "🏢 Business" },
  { key: "hot", label: "Hot" },
  { key: "quiet", label: "Gone quiet" },
  { key: "dnc", label: "Do not contact" },
];

export default function ClientsClient({
  clients, q, f,
}: {
  clients: ClientListItem[];
  q: string;
  f: ClientFilter;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const navigate = (nextQ: string, nextF: ClientFilter) => {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextF !== "all") params.set("f", nextF);
    const qs = params.toString();
    router.replace(qs ? `/clients?${qs}` : "/clients");
  };

  useEffect(() => () => clearTimeout(debounce.current), []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allShownSelected = clients.length > 0 && clients.every((c) => selected.has(c.id));
  const selectAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(clients.map((c) => c.id)));

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); setMsg(null); };

  const doDelete = async () => {
    setBusy(true); setMsg(null);
    const res = await deleteContacts([...selected]);
    setBusy(false);
    if (!res.ok) { setMsg(res.error ?? "Could not delete."); return; }
    setConfirm(false); exitSelect(); router.refresh();
  };

  return (
    <main>
      <div className="mt-6 flex items-baseline justify-between px-5">
        <h1 className="font-display text-[26px]">Clients</h1>
        {selecting ? (
          <button onClick={exitSelect} className="text-sm text-mauve">Done</button>
        ) : (
          <button onClick={() => setSelecting(true)} className="text-sm text-gold">Select</button>
        )}
      </div>

      <div className="mt-1 px-5 text-xs text-fog">
        {clients.length} {clients.length === 1 ? "person" : "people"}
      </div>

      <div className="mt-3 px-5">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            clearTimeout(debounce.current);
            debounce.current = setTimeout(() => navigate(e.target.value, f), 300);
          }}
          placeholder="Search name, phone, email…"
          className="w-full rounded-xl border border-[#E9DFDA] bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
        />
      </div>

      <div className="-mx-0 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => navigate(search, c.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
              f === c.key ? "bg-plum text-white" : "bg-white text-mauve shadow-soft"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {selecting && (
        <div className="mt-3 px-5">
          <button onClick={selectAll} className="text-xs text-mauve underline underline-offset-2">
            {allShownSelected ? "Clear all" : `Select all ${clients.length}`}
          </button>
        </div>
      )}

      <div className={`mt-3 space-y-2 px-5 ${selecting ? "pb-28" : "pb-8"}`}>
        {clients.length === 0 && (
          <p className="py-10 text-center text-sm text-fog">
            {q ? `Nothing matches “${q}”.` : "No one here yet — add your first contact below."}
          </p>
        )}
        {clients.map((c) => {
          const inner = (
            <>
              {selecting && (
                <span className={`mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selected.has(c.id) ? "border-plum bg-plum text-white" : "border-[#D9C9C1] text-transparent"
                }`}>✓</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="truncate text-xs text-mauve">{c.disposition} · {c.coverage}</div>
                <div className="mt-0.5 truncate text-xs text-fog">{c.lastContact}</div>
              </div>
              <span className="ml-3 shrink-0 rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-gold">
                {c.score}
              </span>
            </>
          );
          return selecting ? (
            <button key={c.id} onClick={() => toggle(c.id)}
              className={`flex w-full items-center rounded-card bg-white p-3.5 text-left shadow-soft ${selected.has(c.id) ? "ring-2 ring-plum" : ""}`}>
              {inner}
            </button>
          ) : (
            <Link key={c.id} href={`/contacts/${c.id}`}
              className="flex items-center rounded-card bg-white p-3.5 shadow-soft">
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Bottom action bar in select mode */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto max-w-md px-5 md:max-w-5xl">
          <button
            onClick={() => selected.size && setConfirm(true)}
            disabled={selected.size === 0}
            className="w-full rounded-full bg-rose py-3 text-sm font-medium text-white shadow-soft disabled:opacity-50"
          >
            Delete {selected.size || ""} selected
          </button>
        </div>
      )}

      {!selecting && (
        <button
          onClick={() => setAdding(true)}
          className="fixed bottom-24 right-5 z-30 rounded-full bg-plum px-5 py-3 text-sm text-white shadow-soft"
          aria-label="Add contact"
        >
          + Add
        </button>
      )}

      {adding && <AddContactSheet onClose={() => setAdding(false)} />}

      {confirm && (
        <Sheet onClose={() => !busy && setConfirm(false)}>
          <h2 className="font-display text-xl">Delete {selected.size} {selected.size === 1 ? "contact" : "contacts"}?</h2>
          <p className="mt-1 text-sm text-mauve">
            This permanently removes them and all of their tasks, timeline, deals, and policies. This can't be undone.
          </p>
          <button onClick={doDelete} disabled={busy} className="mt-4 w-full rounded-full bg-rose py-3 text-sm text-white disabled:opacity-60">
            {busy ? "Deleting…" : `Yes, delete ${selected.size}`}
          </button>
          <button onClick={() => setConfirm(false)} disabled={busy} className="mt-2 w-full py-2 text-sm text-mauve">Cancel</button>
          {msg && <p className="mt-2 text-center text-xs text-rose">{msg}</p>}
        </Sheet>
      )}
    </main>
  );
}
