"use client";

import Link from "next/link";
import type { TaskItem } from "@/lib/types";

export default function HitList({ tasks }: { tasks: TaskItem[] }) {
  const hot = [...tasks].sort((a, b) => b.score - a.score).slice(0, 4);

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl">Hit list</h2>
        <span className="text-xs text-gold">ranked by likelihood to close</span>
      </div>
      <div className="-mx-5 mt-2 flex gap-3 overflow-x-auto px-5 pb-1">
        {hot.map((t, i) => (
          <Link
            key={t.id}
            href={`/contacts/${t.contactId}`}
            className={`w-40 shrink-0 rounded-card bg-white p-3.5 shadow-soft ${
              i === 0 ? "border border-gold" : "border border-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-[15px] text-[#C8B8B0]">{i + 1}</span>
              <span className="rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-gold">
                {t.score}
              </span>
            </div>
            <div className="mt-1.5 truncate text-sm font-semibold">{t.name}</div>
            <div className="truncate text-xs text-mauve">{t.disposition}</div>
            <div className="mt-1 truncate text-xs text-fog">{t.lastContact}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
