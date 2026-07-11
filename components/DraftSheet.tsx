"use client";

import { useEffect, useState } from "react";
import type { TaskItem } from "@/lib/types";
import { generateDraft, approveDraft } from "@/app/actions";
import Sheet from "./Sheet";

export default function DraftSheet({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const channel: "text" | "email" = task.kind === "email" ? "email" : "text";
  const [draftId, setDraftId] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"draft" | "sending" | "sent" | "logged">("draft");

  useEffect(() => {
    generateDraft(task.contactId, channel).then((r) => {
      setDraftId(r.id);
      setText(r.content);
      setOriginal(r.content);
    });
  }, [task.contactId, channel]);

  const approve = async () => {
    if (!text) return;
    setStatus("sending");
    const r = await approveDraft(draftId, task.contactId, channel, text, text !== original);
    setStatus(r.sent ? "sent" : "logged");
  };

  return (
    <Sheet onClose={onClose}>
      <p className="text-xs uppercase tracking-[0.15em] text-gold">
        Draft {channel} · in your voice
      </p>
      <h2 className="font-display text-[22px]">{task.name}</h2>

      {editing ? (
        <textarea
          value={text ?? ""}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="mt-3 w-full rounded-card border border-champagne bg-white p-4 text-sm leading-relaxed shadow-soft outline-none focus:border-gold"
        />
      ) : (
        <div className="mt-3 whitespace-pre-wrap rounded-card bg-white p-4 text-sm leading-relaxed shadow-soft">
          {text ?? <span className="text-fog">Writing…</span>}
        </div>
      )}

      {status === "sent" && (
        <div className="mt-4 rounded-card bg-champagne p-4 text-center text-sm text-gold">
          ✓ Sent & logged — automation paused until they reply
        </div>
      )}
      {status === "logged" && (
        <div className="mt-4 rounded-card bg-blush p-4 text-center text-sm text-mauve">
          ✓ Approved & logged — send it from your phone (Twilio/Gmail not connected yet)
        </div>
      )}
      {(status === "draft" || status === "sending") && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={approve}
            disabled={!text || status === "sending"}
            className="flex-1 rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Approve & send"}
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className="flex-1 rounded-full bg-white py-3 text-sm shadow-soft"
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
