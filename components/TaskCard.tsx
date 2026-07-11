"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskItem, TaskKind } from "@/lib/types";
import { completeTask } from "@/app/actions";

const CALL_OUTCOMES = [
  ["connected", "Connected"],
  ["voicemail", "Voicemail"],
  ["no_answer", "No answer"],
] as const;

const KIND: Record<TaskKind, { icon: string; wrap: string }> = {
  call:     { icon: "✆",  wrap: "bg-blush text-mauve" },
  text:     { icon: "💬", wrap: "bg-blush text-mauve" },
  email:    { icon: "✉",  wrap: "bg-blush text-mauve" },
  birthday: { icon: "✿",  wrap: "bg-champagne text-gold" },
  renewal:  { icon: "↻",  wrap: "bg-champagne text-gold" },
  cold:     { icon: "❄",  wrap: "bg-[#E8EDE7] text-[#7A8B76]" },
};

export default function TaskCard({ task, onDraft }: { task: TaskItem; onDraft: () => void }) {
  const k = KIND[task.kind];
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<"open" | "done">("open");

  const finish = (outcome: string) => {
    setPicking(false);
    setState("done");
    void completeTask(task.id, outcome); // logs + advances the sequence
  };

  if (state === "done") {
    return (
      <div className="rounded-card bg-white p-4 text-sm text-fog shadow-soft line-through">
        {task.name} — done
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-3 rounded-card bg-white p-4 shadow-soft">
      <button
        onClick={() => (task.kind === "call" ? setPicking(!picking) : finish("completed"))}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rose bg-blush text-xs text-mauve"
        aria-label="Complete task"
      />
      {picking && (
        <div className="absolute left-3 top-14 z-10 flex gap-1.5 rounded-full bg-plum p-1.5 shadow-soft">
          {CALL_OUTCOMES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => finish(value)}
              className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Link href={`/contacts/${task.contactId}`} className="flex flex-1 items-center gap-3 text-left">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${k.wrap}`}>
          {k.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{task.name}</span>
            <span className="rounded-full bg-champagne px-1.5 py-0.5 text-xs text-gold">{task.score}</span>
          </div>
          <div className="truncate text-xs text-mauve">{task.note}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs">
            <span className="rounded-full bg-blush px-1.5 py-0.5 text-mauve">{task.disposition}</span>
            <span className="text-fog">Last: {task.lastContact}</span>
          </div>
        </div>
      </Link>
      <button
        onClick={onDraft}
        className="shrink-0 rounded-full bg-plum px-3 py-2 text-xs text-white"
      >
        Draft
      </button>
    </div>
  );
}
