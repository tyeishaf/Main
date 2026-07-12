-- 0006_income_and_policies.sql — Phase 11: real income + USHA policy import
--
-- Adds a weekly income log (agent payouts) and extends the policies table
-- so a carrier sales report (USHA) can be imported and deduplicated.

-- ── Weekly income entries (agent payouts) ────────────────────
create table if not exists income_entries (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references orgs(id),
  amount     numeric(12,2) not null,      -- payout for the period (e.g. Total Payout)
  paid_on    date not null,               -- pay date
  source     text,                        -- e.g. 'USHA weekly'
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_income_org_date on income_entries(org_id, paid_on);

alter table income_entries enable row level security;

drop policy if exists income_org_all on income_entries;
create policy income_org_all on income_entries
  for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

grant all on income_entries to authenticated, service_role;

-- ── Policy import support ─────────────────────────────────────
-- external_id  = carrier application id (AppID) → dedupes re-uploads
-- source_status = raw carrier status text ('In Force', 'Withdrawn', 'Not Taken')
-- premium_amount = premium figure from the sales report
alter table policies add column if not exists external_id    text;
alter table policies add column if not exists source_status  text;
alter table policies add column if not exists premium_amount numeric(12,2);  -- Premium column
alter table policies add column if not exists total_amount   numeric(12,2);  -- Premium + Fees + Assoc

create unique index if not exists uq_policies_ext
  on policies(org_id, external_id) where external_id is not null;
