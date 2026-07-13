-- 0007_budget.sql — Phase 12: budget, expenses, recurring bills, goals
-- Business + personal expense tracking with bank-statement import support.

-- income entries gain a category (USHA commission vs other income)
alter table income_entries add column if not exists category text;

-- one-off / imported expenses
create table if not exists expenses (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  amount      numeric(12,2) not null,       -- positive = money out
  spent_on    date not null,
  kind        text not null default 'business',  -- 'business' | 'personal'
  category    text not null,
  merchant    text,
  note        text,
  source      text not null default 'manual',    -- 'manual' | 'bank'
  external_id text,                               -- bank txn fingerprint (dedupe)
  created_at  timestamptz not null default now()
);
create index if not exists idx_expenses_org_date on expenses(org_id, spent_on);
create unique index if not exists uq_expenses_ext
  on expenses(org_id, external_id) where external_id is not null;
alter table expenses enable row level security;
drop policy if exists expenses_org_all on expenses;
create policy expenses_org_all on expenses for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
grant all on expenses to authenticated, service_role;

-- fixed monthly bills (auto-counted every month)
create table if not exists recurring_expenses (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references orgs(id),
  label      text not null,
  amount     numeric(12,2) not null,
  kind       text not null default 'business',
  category   text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table recurring_expenses enable row level security;
drop policy if exists recurring_org_all on recurring_expenses;
create policy recurring_org_all on recurring_expenses for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
grant all on recurring_expenses to authenticated, service_role;

-- monthly goals (one row per org)
create table if not exists budget_settings (
  org_id       uuid primary key references orgs(id),
  income_goal  numeric(12,2) not null default 0,
  savings_goal numeric(12,2) not null default 0,
  updated_at   timestamptz not null default now()
);
alter table budget_settings enable row level security;
drop policy if exists budget_settings_org_all on budget_settings;
create policy budget_settings_org_all on budget_settings for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
grant all on budget_settings to authenticated, service_role;
