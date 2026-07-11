import { getPipeline } from "@/lib/data";

export default async function PipelinePage() {
  const stages = await getPipeline();
  return (
    <main>
      <h1 className="mt-6 px-5 font-display text-[26px]">Pipeline</h1>
      <p className="px-5 text-sm text-mauve">$4,120/mo premium in play</p>
      <div className="mt-4 flex gap-3 overflow-x-auto px-5 pb-8">
        {stages.map((s) => (
          <div key={s.name} className="w-44 shrink-0">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-gold">
              {s.name} · {s.deals.length}
            </div>
            <div className="space-y-2">
              {s.deals.map((d) => (
                <div key={d} className="rounded-xl bg-white p-3 text-sm shadow-soft">{d}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
