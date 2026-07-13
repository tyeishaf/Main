"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contact, TimelineEvent } from "@/lib/types";
import { DISPOSITIONS, TERMINAL_DISPOSITIONS } from "@/lib/mock";
import Sheet from "./Sheet";
import { setDisposition, summarizeContact, deleteContact } from "@/app/actions";

const digits = (p: string) => p.replace(/\D/g, "");
function formatPhone(p: string): string {
  const d = digits(p);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}

export default function ContactClient({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [dispo, setDispo] = useState(contact.disposition);
  const [picking, setPicking] = useState(false);
  const [log, setLog] = useState<TimelineEvent[]>(contact.timeline);
  const [summarizing, setSummarizing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    const r = await deleteContact(contact.id);
    if (r.ok) { router.push("/clients"); router.refresh(); }
    else { setDeleting(false); setConfirmDel(false); }
  };

  const summarize = async () => {
    setSummarizing(true);
    const r = await summarizeContact(contact.id);
    setSummarizing(false);
    if (r.ok) setLog([{ at: "Just now", type: "ai", text: r.text }, ...log]);
  };

  const changeDispo = (d: string) => {
    setDispo(d);
    setPicking(false);
    setLog([
      { at: "Just now", type: "sys", text: `Disposition changed to "${d}" — follow-up sequence adjusted` },
      ...log,
    ]);
    void setDisposition(contact.id, d); // persists + logs activity + pauses sequences
  };

  return (
    <main className="px-5">
      <Link href="/" className="mt-5 inline-block text-sm text-mauve">← Back</Link>

      <section className="mt-3 rounded-3xl bg-white p-5 shadow-soft">
        <h1 className="font-display text-[26px]">{contact.name}</h1>
        <p className="mt-0.5 text-sm text-mauve">{contact.summaryLine}</p>
        <p className="mt-1 text-xs text-fog">Last contact: {contact.lastContact}</p>

        {/* Contact details */}
        <div className="mt-3 space-y-1.5 text-sm">
          {contact.phone && (
            <a href={`tel:${digits(contact.phone)}`} className="flex items-center gap-2 text-plum">
              <span className="text-gold">✆</span> {formatPhone(contact.phone)}
              {contact.phoneAlt && <span className="text-xs text-fog">· alt {formatPhone(contact.phoneAlt)}</span>}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 break-all text-plum">
              <span className="text-gold">✉</span> {contact.email}
            </a>
          )}
          {contact.location && (
            <div className="flex items-center gap-2 text-mauve">
              <span className="text-gold">⌖</span> {contact.location}
            </div>
          )}
          {!contact.phone && !contact.email && (
            <p className="text-xs text-fog">No phone or email on file.</p>
          )}
        </div>

        <button
          onClick={() => setPicking(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-plum px-4 py-2 text-sm text-white"
        >
          {dispo} <span className="text-gold">▾</span>
        </button>

        <div className="mt-3 flex flex-wrap gap-2">
          {contact.phone ? (
            <>
              <a href={`tel:${digits(contact.phone)}`} className="rounded-full bg-plum px-3.5 py-1.5 text-xs text-white">Call</a>
              <a href={`sms:${digits(contact.phone)}`} className="rounded-full bg-blush px-3.5 py-1.5 text-xs text-mauve">Text</a>
            </>
          ) : (
            <>
              <span className="rounded-full bg-[#F1EAE6] px-3.5 py-1.5 text-xs text-fog">Call</span>
              <span className="rounded-full bg-[#F1EAE6] px-3.5 py-1.5 text-xs text-fog">Text</span>
            </>
          )}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="rounded-full bg-blush px-3.5 py-1.5 text-xs text-mauve">Email</a>
          ) : (
            <span className="rounded-full bg-[#F1EAE6] px-3.5 py-1.5 text-xs text-fog">Email</span>
          )}
          <button onClick={summarize} disabled={summarizing}
            className="rounded-full bg-champagne px-3.5 py-1.5 text-xs text-gold disabled:opacity-60">
            {summarizing ? "Thinking…" : "Summarize ✦"}
          </button>
        </div>
      </section>

      {picking && (
        <Sheet onClose={() => setPicking(false)}>
          <h2 className="font-display text-xl">Set disposition</h2>
          <div className="mt-3 flex flex-wrap gap-2 pb-6">
            {DISPOSITIONS.map((d) => (
              <button
                key={d}
                onClick={() => changeDispo(d)}
                className={`rounded-full px-3.5 py-2 text-sm shadow-soft ${
                  d === dispo ? "bg-plum text-white" : "bg-white"
                } ${TERMINAL_DISPOSITIONS.has(d) ? "border border-rose" : "border border-transparent"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      <h2 className="mt-5 mb-2 font-display text-[19px]">Timeline</h2>
      <div className="relative border-l border-[#E9DFDA] pl-4 pb-8">
        {log.map((e, i) => (
          <div key={i} className="relative mb-4">
            <div
              className={`absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full ${
                e.type === "ai" ? "bg-gold" : "bg-rose"
              }`}
            />
            <div className="text-xs text-mauve">{e.at}</div>
            <div
              className={`mt-0.5 rounded-xl p-3 text-sm leading-relaxed shadow-soft ${
                e.type === "ai" ? "bg-champagne font-display italic" : "bg-white"
              }`}
            >
              {e.text}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setConfirmDel(true)}
        className="mx-auto mb-8 block text-xs text-rose"
      >
        Delete this contact
      </button>

      {confirmDel && (
        <Sheet onClose={() => !deleting && setConfirmDel(false)}>
          <h2 className="font-display text-xl">Delete {contact.name}?</h2>
          <p className="mt-1 text-sm text-mauve">
            This permanently removes this contact and all of their tasks, timeline, deals, and policies. This can't be undone.
          </p>
          <button
            onClick={remove}
            disabled={deleting}
            className="mt-4 w-full rounded-full bg-rose py-3 text-sm text-white disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Yes, delete permanently"}
          </button>
          <button onClick={() => setConfirmDel(false)} disabled={deleting} className="mt-2 w-full py-2 text-sm text-mauve">
            Keep contact
          </button>
        </Sheet>
      )}
    </main>
  );
}
