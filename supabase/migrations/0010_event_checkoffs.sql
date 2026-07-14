-- 0010_event_checkoffs.sql — Phase 16: check off calendar events
-- Records which Google Calendar events the advisor has marked done.

create table if not exists event_checkoffs (
  org_id     uuid not null references orgs(id),
  event_id   text not null,           -- Google Calendar event id
  done_at    timestamptz not null default now(),
  primary key (org_id, event_id)
);
alter table event_checkoffs enable row level security;
drop policy if exists event_checkoffs_org_all on event_checkoffs;
create policy event_checkoffs_org_all on event_checkoffs for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
grant all on event_checkoffs to authenticated, service_role;
