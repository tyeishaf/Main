"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientFilter, ClientListItem } from "@/lib/types";
import AddContactSheet from "./AddContactSheet";

const CHIPS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "leads", label: "Leads" },
  { key: "clients", label: "Clients" },
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
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const navigate = (nextQ: string, nextF: ClientFilter) => {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextF !== "all") params.set("f", nextF);
    const qs = params.toString();
    router.replace(qs ? `/clients?${qs}` : "/clients");
  };

  useEffect(() => () => clearTimeout(debounce.current), []);

  return (
    <main>
      <div className="mt-6 flex items-baseline justify-between px-5">
        <h1 className="font-display text-[26px]">Clients</h1>
        <span className="text-xs text-fog">
          {clients.length} {clients.length === 1 ? "person" : "people"}
        </span>
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
              f === c.key
                ? "bg-plum text-white"
                : "bg-white text-mauve shadow-soft"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2 px-5 pb-8">
        {clients.length === 0 && (
          <p className="py-10 text-center text-sm text-fog">
            {q ? `Nothing matches “${q}”.` : "No one here yet — add your first contact below."}
          </p>
        )}
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/contacts/${c.id}`}
            className="flex items-center justify-between rounded-card bg-white p-3.5 shadow-soft"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{c.name}</div>
              <div className="truncate text-xs text-mauve">
                {c.disposition} · {c.coverage}
              </div>
              <div className="mt-0.5 truncate text-xs text-fog">{c.lastContact}</div>
            </div>
            <span className="ml-3 shrink-0 rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-gold">
              {c.score}
            </span>
          </Link>
        ))}
      </div>

      <button
        onClick={() => setAdding(true)}
        className="fixed bottom-24 right-5 z-30 rounded-full bg-plum px-5 py-3 text-sm text-white shadow-soft"
        aria-label="Add contact"
      >
        + Add
      </button>

      {adding && <AddContactSheet onClose={() => setAdding(false)} />}
    </main>
  );
}
