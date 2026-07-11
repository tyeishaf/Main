"use client";

import { useRef, useState, useTransition } from "react";
import { importLeads } from "@/app/actions";
import type { LeadSource } from "@/lib/types";
import Sheet from "./Sheet";

const MAPPING: [string, string, boolean][] = [
  ["first_name", "First Name", true],
  ["last_name", "Last Name", true],
  ["phone", "Phone Number", true],
  ["email", "Email Address", true],
  ["state", "State", true],
  ["coverage_type", "Product Interest", true],
  ["lead_source", "— set all to 'Facebook July batch'", false],
];

export default function ImportSheet({
  sources,
  onClose,
}: {
  sources: LeadSource[];
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [csv, setCsv] = useState<{ name: string; text: string; rows: number } | null>(null);
  const [result, setResult] = useState<{ created: number; merged: number; enrolled: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter((l) => l.trim()).length - 1;
    setCsv({ name: file.name, text, rows: Math.max(rows, 0) });
    setStep(1);
  };

  const runImport = () => {
    if (!csv) return;
    startTransition(async () => {
      const r = await importLeads(csv.text, "CSV import", true);
      setResult({ created: r.created ?? 0, merged: r.merged ?? 0, enrolled: r.enrolled ?? 0 });
      setStep(2);
    });
  };

  return (
    <Sheet onClose={onClose}>
      {step === 0 && (
        <>
          <h2 className="font-display text-[22px]">Add leads</h2>

          <p className="mt-3 text-xs uppercase tracking-[0.12em] text-gold">
            Connected sources · auto-sync
          </p>
          <div className="mt-2 space-y-2">
            {sources.map((s) => (
              <div
                key={s.provider}
                className="flex items-center justify-between rounded-xl bg-white p-3.5 shadow-soft"
              >
                <div>
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-xs text-mauve">{s.status}</div>
                </div>
                {s.live && (
                  <span className="rounded-full bg-[#E8EDE7] px-2.5 py-1 text-xs text-[#6E8069]">
                    ● Live
                  </span>
                )}
              </div>
            ))}
            <button className="w-full rounded-xl border border-dashed border-[#D8C9C2] p-3 text-sm text-mauve">
              + Connect another source
            </button>
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.12em] text-gold">One-time upload</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-2 w-full rounded-card border-2 border-dashed border-rose bg-blush p-6 text-center"
          >
            <div className="text-2xl text-mauve">⇪</div>
            <div className="mt-1 text-sm font-medium">CSV, Excel, or vendor export</div>
            <div className="mt-0.5 text-xs text-mauve">tap to choose · drag & drop on desktop</div>
          </button>
          <p className="mt-3 text-center text-xs text-fog">
            Duplicates are detected by phone & email and merged, never overwritten.
          </p>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="font-display text-[22px]">Map columns</h2>
          <p className="mt-1 text-sm text-mauve">
            <span className="text-gold">✦</span> Columns auto-matched from <b>{csv?.name ?? "your file"}</b> · {csv?.rows ?? 0} rows
          </p>
          <div className="mt-3 space-y-2">
            {MAPPING.map(([field, col, auto]) => (
              <div
                key={field}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-soft"
              >
                <span className="text-sm font-medium">{field}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    auto ? "bg-champagne text-gold" : "bg-blush text-mauve"
                  }`}
                >
                  {col} {auto ? "▾" : ""}
                </span>
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-plum text-xs text-gold">✓</span>
            Enroll new leads in the Day-1 follow-up sequence
          </label>
          <button
            onClick={runImport}
            disabled={pending}
            className="mt-4 w-full rounded-full bg-plum py-3 text-sm text-white disabled:opacity-60"
          >
            {pending ? "Importing…" : `Import ${csv?.rows ?? 0} leads`}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="font-display text-[22px]">Import complete</h2>
          <div className="mt-3 space-y-2 rounded-card bg-white p-4 text-sm shadow-soft">
            <div><span className="font-display text-lg text-gold">{result?.created ?? 0}</span> new leads created</div>
            <div><span className="font-display text-lg text-mauve">{result?.merged ?? 0}</span> duplicates merged into existing records</div>
            <div><span className="font-display text-lg text-sage">{result?.enrolled ?? 0}</span> enrolled in Day-1 sequence — first calls on today&apos;s list</div>
          </div>
          <p className="mt-3 rounded-card bg-champagne p-3 font-display text-sm italic">
            ✦ 6 of these leads look especially strong — family coverage requests in your licensed states.
            I&apos;ve boosted them onto your hit list.
          </p>
        </>
      )}
    </Sheet>
  );
}
