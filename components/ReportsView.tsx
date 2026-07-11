import type { ReportData } from "@/lib/types";

/**
 * Reports (Phase 10) — presentational only, no interaction, so it stays a
 * plain server component. Charts are inline bars in the house palette:
 * gold is reserved for money, every value carries a text label (no
 * meaning is encoded in color alone).
 */
export default function ReportsView({ data }: { data: ReportData }) {
  const maxCommission = Math.max(1, ...data.trend.map((m) => m.commission));
  const closed = data.conversion.won + data.conversion.lost;
  const total = closed + data.conversion.open || 1;
  const maxLeads = Math.max(1, ...data.sources.map((s) => s.leads));
  const maxStage = Math.max(1, ...data.pipeline.map((s) => s.value));

  return (
    <main className="px-5 pb-8">
      <div className="mt-6 flex items-baseline justify-between">
        <h1 className="font-display text-[26px]">Reports</h1>
        <span className="text-xs text-fog">{data.generatedLabel}</span>
      </div>
      {!data.live && (
        <p className="mt-1 text-xs text-mauve">
          Sample data — connect Supabase to see your real numbers.
        </p>
      )}

      {/* Headline tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile label="This month" value={data.headline.monthlyCommission} gold sub="commission recognized" />
        <Tile label="Year to date" value={data.headline.ytdCommission} gold sub="commission recognized" />
        <Tile label="Active policies" value={String(data.headline.activePolicies)} />
        <Tile label="Conversion" value={data.headline.conversion} sub="won / closed" />
      </div>

      {/* Commission trend */}
      <Card title="Commission trend" hint="last 6 months">
        <div className="flex items-end gap-2" style={{ height: 132 }}>
          {data.trend.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold text-gold">
                {m.commission ? `$${(m.commission / 1000).toFixed(1)}k` : "—"}
              </span>
              <div
                className="w-full rounded-t-md bg-gold/80"
                style={{ height: Math.max(2, (m.commission / maxCommission) * 96) }}
                title={`${m.label}: $${m.commission.toLocaleString()} · ${m.policiesSold} sold`}
              />
              <span className="text-[11px] text-mauve">{m.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-fog">
          Policies sold: {data.trend.map((m) => m.policiesSold).join(" · ")}
        </p>
      </Card>

      {/* Conversion */}
      <Card title="Deal outcomes" hint={`${closed} closed · ${data.conversion.open} open`}>
        <div className="flex h-6 overflow-hidden rounded-full">
          <Seg n={data.conversion.won} total={total} className="bg-sage" />
          <Seg n={data.conversion.lost} total={total} className="bg-rose" />
          <Seg n={data.conversion.open} total={total} className="bg-champagne" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <Legend swatch="bg-sage" label="Won" n={data.conversion.won} />
          <Legend swatch="bg-rose" label="Lost" n={data.conversion.lost} />
          <Legend swatch="bg-champagne" label="Open" n={data.conversion.open} />
        </div>
      </Card>

      {/* Lead sources */}
      <Card title="Where your closes come from" hint="by lead volume">
        {data.sources.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-3">
            {data.sources.map((sc) => (
              <div key={sc.source}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="truncate">{sc.source}</span>
                  <span className="ml-2 shrink-0 text-xs text-mauve">
                    {sc.won}/{sc.leads} · <span className="font-semibold text-gold">{sc.closeRate}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-blush">
                  <div className="h-full rounded-full bg-mauve" style={{ width: `${(sc.leads / maxLeads) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pipeline value */}
      <Card title="Premium in play" hint="open deals by stage">
        {data.pipeline.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-3">
            {data.pipeline.map((st) => (
              <div key={st.stage}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{st.stage} <span className="text-xs text-fog">· {st.count}</span></span>
                  <span className="ml-2 shrink-0 text-xs font-semibold text-gold">
                    ${st.value.toLocaleString()}/mo
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-champagne">
                  <div className="h-full rounded-full bg-gold/80" style={{ width: `${(st.value / maxStage) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function Tile({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className="rounded-card bg-white p-4 shadow-soft">
      <div className={`font-display text-[24px] ${gold ? "text-gold" : ""}`}>{value}</div>
      <div className="text-xs text-mauve">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-fog">{sub}</div>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-3xl bg-white p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg">{title}</h2>
        {hint && <span className="text-xs text-fog">{hint}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Seg({ n, total, className }: { n: number; total: number; className: string }) {
  if (n <= 0) return null;
  return <div className={className} style={{ width: `${(n / total) * 100}%` }} title={String(n)} />;
}

function Legend({ swatch, label, n }: { swatch: string; label: string; n: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${swatch}`} />
      {label} <span className="font-semibold">{n}</span>
    </span>
  );
}

function Empty() {
  return <p className="text-sm text-fog">Nothing to show yet — data appears as deals move.</p>;
}
