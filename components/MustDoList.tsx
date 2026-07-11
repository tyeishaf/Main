"use client";

import { useState } from "react";
import type { MustDoItem } from "@/lib/types";
import { completeTask } from "@/app/actions";

export default function MustDoList({ items }: { items: MustDoItem[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(done);
    next.has(id) ? next.delete(id) : next.add(id);
    setDone(next);
    if (next.has(id)) void completeTask(id); // persists + logs activity
  };

  const remaining = items.filter((m) => !done.has(m.id)).length;

  return (
    <section className="mt-4 rounded-3xl border border-champagne bg-white p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[19px]">Before the day ends</h2>
        <span className="text-xs text-gold">{remaining} left</span>
      </div>
      <div className="mt-3 space-y-2.5">
        {items.map((m) => {
          const isDone = done.has(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m.id)} className="flex w-full items-start gap-3 text-left">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  isDone ? "bg-gold text-white" : "border border-rose bg-blush"
                }`}
              >
                {isDone ? "✓" : ""}
              </span>
              <span>
                <span
                  className={`block text-sm font-medium ${isDone ? "line-through opacity-50" : ""}`}
                >
                  {m.title}
                </span>
                <span className={`text-xs ${m.urgent && !isDone ? "text-[#B5654F]" : "text-fog"}`}>
                  {m.why}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
