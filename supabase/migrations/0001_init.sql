-- ============================================================
-- PHASE 2 — DATABASE SCHEMA
-- AI-First Health Insurance CRM  (Supabase / PostgreSQL 15+)
-- Run as a Supabase migration: supabase/migrations/0001_init.sql
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;        -- fuzzy global search
create extension if not exists pgcrypto;       -- field-level encryption helpers
-- pg_cron is enabled from the Supabase dashboard (Database > Extensions)

-- ------------------------------------------------------------
-- 1. ORGANIZATIONS & USERS  (multi-user agency ready, day one)
-- ------------------------------------------------------------
create table orgs (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create type user_role as enum ('owner', 'agent', 'assistant');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references orgs(id),
  role        user_role not null default 'owner',
  full_name   text,
  phone       text,
  timezone    text not null default 'America/New_York',
  quiet_hours_start time not null default '20:00',
  quiet_hours_end   time not null default '09:00',
  tone_profile jsonb,          -- learned writing style for AI drafts
  created_at  timestamptz not null default now()
);

-- helper for RLS
create or replace function current_org_id() returns uuid
language sql stable security definer as $$
  select org_id from profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 2. CONTACTS  (leads and clients are one lifecycle)
-- ------------------------------------------------------------
create type lifecycle_stage as enum ('lead','prospect','client','lapsed','do_not_contact');
create type contact_method as enum ('call','text','email','any');

create table contacts (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references orgs(id),
  owner_id      uuid references profiles(id),          -- assigned agent
  lifecycle     lifecycle_stage not null default 'lead',

  first_name    text not null,
  last_name     text,
  phone         text,
  phone_alt     text,
  email         text,
  address       text,
  city          text,
  state         text,                                   -- 2-letter
  zip           text,
  occupation    text,
  household_size int,
  business_name text,

  coverage_type    text[],       -- ['individual','dental','life',...]
  coverage_needed  text,
  budget_monthly   numeric(10,2),
  preferred_contact contact_method not null default 'any',
  best_time_to_contact text,

  lead_source     text,
  referral_source text,          -- name/id of referring person
  referred_by     uuid references contacts(id),

  -- scoring (recomputed nightly + on events)
  lead_score        int not null default 0,     -- 0-100
  priority_score    int not null default 0,
  close_probability numeric(4,3),               -- 0.000-1.000
  score_reasons     jsonb,                      -- explainability

  -- follow-up engine denormalized pointers (fast dashboard queries)
  current_disposition_id uuid,                  -- fk added after dispositions
  next_follow_up_at timestamptz,
  last_contact_at   timestamptz,
  last_inbound_at   timestamptz,

  notes         text,
  custom_fields jsonb not null default '{}',
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
      coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' ||
      coalesce(business_name,'') || ' ' || coalesce(notes,''))
  ) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_contacts_org        on contacts(org_id);
create index idx_contacts_followup   on contacts(org_id, next_follow_up_at);
create index idx_contacts_search     on contacts using gin(search_vector);
create index idx_contacts_phone_trgm on contacts using gin(phone gin_trgm_ops);
create index idx_contacts_score      on contacts(org_id, lead_score desc);

-- PHI isolated: separate table, separate audit, excluded from AI by default
create table contact_health_profiles (
  contact_id  uuid primary key references contacts(id) on delete cascade,
  org_id      uuid not null references orgs(id),
  date_of_birth date,
  age int generated always as (date_part('year', age(date_of_birth))::int) stored,
  income_annual numeric(12,2),
  pre_existing_conditions text,
  medications text,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TAGS & DISPOSITIONS (customizable)
-- ------------------------------------------------------------
create table tags (
  id     uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  name   text not null,
  color  text,
  unique (org_id, name)
);

create table contact_tags (
  contact_id uuid references contacts(id) on delete cascade,
  tag_id     uuid references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table dispositions (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references orgs(id),
  name       text not null,
  category   text,          -- 'active','won','lost','compliance'
  sort_order int not null default 0,
  is_terminal boolean not null default false,   -- Dead Lead, DNC, Policy Issued
  pauses_sequences boolean not null default false,
  unique (org_id, name)
);

alter table contacts
  add constraint fk_contacts_disposition
  foreign key (current_disposition_id) references dispositions(id);

create table disposition_history (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references orgs(id),
  contact_id     uuid not null references contacts(id) on delete cascade,
  disposition_id uuid not null references dispositions(id),
  set_by         uuid references profiles(id),
  set_at         timestamptz not null default now(),
  note           text
);

-- ------------------------------------------------------------
-- 4. PIPELINE: DEALS & POLICIES
-- ------------------------------------------------------------
create table pipelines (
  id     uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id),
  name   text not null
);

create table pipeline_stages (
  id          uuid primary key default uuid_generate_v4(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name        text not null,
  sort_order  int not null,
  win_probability numeric(4,3)    -- default probability at this stage
);

create type deal_status as enum ('open','won','lost');

create table deals (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references orgs(id),
  contact_id   uuid not null references contacts(id) on delete cascade,
  pipeline_id  uuid not null references pipelines(id),
  stage_id     uuid not null references pipeline_stages(id),
  status       deal_status not null default 'open',
  product_type text not null,               -- individual/family/group/dental/...
  carrier      text,
  est_monthly_premium numeric(10,2),
  est_annual_commission numeric(10,2),
  lost_reason  text,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);

create type policy_status as enum ('pending','active','lapsed','cancelled','renewed');

create table policies (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references orgs(id),
  contact_id    uuid not null references contacts(id) on delete cascade,
  deal_id       uuid references deals(id),
  policy_number text,
  product_type  text not null,
  carrier       text,
  status        policy_status not null default 'pending',
  monthly_premium   numeric(10,2),
  annual_commission numeric(10,2),
  effective_date date,
  renewal_date   date,
  cancelled_at   date,
  created_at     timestamptz not null default now()
);

create index idx_policies_renewal on policies(org_id, renewal_date)
  where status = 'active';

-- ------------------------------------------------------------
-- 5. UNIFIED ACTIVITY TIMELINE  (the AI's memory)
-- ------------------------------------------------------------
create type activity_type as enum (
  'call','sms','email','note','meeting','task_completed',
  'disposition_change','stage_change','document','ai_summary','system'
);
create type activity_direction as enum ('inbound','outbound','internal');
create type activity_outcome as enum (
  'connected','voicemail','no_answer','busy','wrong_number',
  'replied','opened','bounced','scheduled','completed','none'
);

create table activities (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  actor_id    uuid references profiles(id),      -- null = automation
  type        activity_type not null,
  direction   activity_direction not null default 'internal',
  outcome     activity_outcome not null default 'none',
  subject     text,
  body        text,
  metadata    jsonb not null default '{}',       -- provider ids, durations, etc.
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index idx_activities_contact on activities(contact_id, occurred_at desc);
create index idx_activities_org_time on activities(org_id, occurred_at desc);

-- keep contact.last_contact_at / last_inbound_at fresh
create or replace function touch_contact_on_activity() returns trigger
language plpgsql as $$
begin
  if new.contact_id is not null and new.type in ('call','sms','email','meeting') then
    update contacts set
      last_contact_at = greatest(coalesce(last_contact_at,'-infinity'), new.occurred_at),
      last_inbound_at = case when new.direction = 'inbound'
        then greatest(coalesce(last_inbound_at,'-infinity'), new.occurred_at)
        else last_inbound_at end,
      updated_at = now()
    where id = new.contact_id;
  end if;
  return new;
end $$;
create trigger trg_activity_touch after insert on activities
  for each row execute function touch_contact_on_activity();

-- ------------------------------------------------------------
-- 6. TASKS  (the universal "what do I do" unit)
-- ------------------------------------------------------------
create type task_type as enum ('call','text','email','appointment_prep','document','review','general');
create type task_status as enum ('open','done','skipped','cancelled');
create type task_priority as enum ('low','normal','high','urgent');

create table tasks (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  assignee_id uuid references profiles(id),
  type        task_type not null default 'general',
  title       text not null,
  description text,
  priority    task_priority not null default 'normal',
  status      task_status not null default 'open',
  due_at      timestamptz,
  completed_at timestamptz,
  outcome     activity_outcome,                 -- feeds the sequence engine
  source      text not null default 'manual',   -- manual | sequence | ai | automation
  enrollment_id uuid,                           -- fk added below
  created_at  timestamptz not null default now()
);
create index idx_tasks_today on tasks(org_id, status, due_at);
create index idx_tasks_contact on tasks(contact_id) where status = 'open';

-- ------------------------------------------------------------
-- 7. FOLLOW-UP SEQUENCES  (branching state machine)
-- ------------------------------------------------------------
create table sequences (
  id        uuid primary key default uuid_generate_v4(),
  org_id    uuid not null references orgs(id),
  name      text not null,
  is_default boolean not null default false,
  active    boolean not null default true
);

create table sequence_steps (
  id           uuid primary key default uuid_generate_v4(),
  sequence_id  uuid not null references sequences(id) on delete cascade,
  step_order   int not null,
  task_type    task_type not null,
  delay_hours  int not null default 24,        -- from previous step resolution
  template_id  uuid,                            -- fk to message_templates below
  -- branching: outcome -> which step to jump to (null = next in order)
  branch_rules jsonb not null default '{}'      -- {"no_answer":"<step_id>","replied":"pause"}
);

create type enrollment_status as enum ('active','paused','completed','exited');

create table sequence_enrollments (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references orgs(id),
  contact_id   uuid not null references contacts(id) on delete cascade,
  sequence_id  uuid not null references sequences(id),
  status       enrollment_status not null default 'active',
  current_step uuid references sequence_steps(id),
  next_run_at  timestamptz,
  paused_reason text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index idx_enroll_due on sequence_enrollments(status, next_run_at);

alter table tasks add constraint fk_tasks_enrollment
  foreign key (enrollment_id) references sequence_enrollments(id);

-- ------------------------------------------------------------
-- 8. MESSAGING: TEMPLATES + OUTBOUND/INBOUND LOG
-- ------------------------------------------------------------
create table message_templates (
  id       uuid primary key default uuid_generate_v4(),
  org_id   uuid not null references orgs(id),
  name     text not null,
  channel  task_type not null,          -- call script / text / email
  subject  text,
  body     text not null,               -- supports {{first_name}} merge vars
  category text                         -- birthday, renewal, follow_up, winback...
);

alter table sequence_steps add constraint fk_step_template
  foreign key (template_id) references message_templates(id);

create type message_status as enum ('queued','sent','delivered','failed','received');

create table messages (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  activity_id uuid references activities(id),
  channel     text not null,             -- sms | email
  direction   activity_direction not null,
  status      message_status not null default 'queued',
  provider    text,                      -- twilio | gmail | outlook
  provider_message_id text,
  to_address  text,
  from_address text,
  subject     text,
  body        text,
  scheduled_for timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_messages_provider on messages(provider, provider_message_id);

-- ------------------------------------------------------------
-- 9. APPOINTMENTS & DOCUMENTS
-- ------------------------------------------------------------
create type appt_status as enum ('scheduled','confirmed','completed','no_show','cancelled');

create table appointments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  title       text not null,
  status      appt_status not null default 'scheduled',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,                      -- phone / zoom / address
  external_calendar_id text,             -- Google Calendar event id
  source      text,                      -- manual | calendly
  notes       text,
  created_at  timestamptz not null default now()
);
create index idx_appts_day on appointments(org_id, starts_at);

create table documents (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  policy_id   uuid references policies(id),
  name        text not null,
  storage_path text not null,            -- Supabase Storage key
  mime_type   text,
  size_bytes  bigint,
  contains_phi boolean not null default true,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 10. AI OUTPUTS  (briefings, drafts, summaries, scores)
-- ------------------------------------------------------------
create type ai_output_type as enum (
  'daily_briefing','draft_sms','draft_email','summary',
  'score_explanation','coaching','proposal','other'
);

create table ai_outputs (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references orgs(id),
  contact_id  uuid references contacts(id) on delete cascade,
  user_id     uuid references profiles(id),
  type        ai_output_type not null,
  prompt_version text,
  content     text not null,
  approved    boolean,                    -- user accepted the draft?
  edited_content text,                    -- their edit → feeds tone_profile
  created_at  timestamptz not null default now()
);
create index idx_ai_outputs_day on ai_outputs(org_id, type, created_at desc);

-- ------------------------------------------------------------
-- 11. INTEGRATIONS & JOB QUEUE
-- ------------------------------------------------------------
create table integrations (
  id        uuid primary key default uuid_generate_v4(),
  org_id    uuid not null references orgs(id),
  user_id   uuid references profiles(id),
  provider  text not null,               -- twilio|gmail|gcal|calendly|...
  status    text not null default 'connected',
  credentials jsonb not null,            -- encrypted via Supabase Vault in prod
  settings  jsonb not null default '{}',
  unique (org_id, user_id, provider)
);

create type job_status as enum ('pending','running','done','failed','dead');

create table job_queue (
  id         bigserial primary key,
  org_id     uuid references orgs(id),
  job_type   text not null,              -- send_sms | send_email | score_contact | sequence_tick
  payload    jsonb not null default '{}',
  status     job_status not null default 'pending',
  run_at     timestamptz not null default now(),
  attempts   int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  created_at timestamptz not null default now()
);
create index idx_jobs_due on job_queue(status, run_at) where status = 'pending';

-- ------------------------------------------------------------
-- 12. AUDIT LOG  (HIPAA-conscious)
-- ------------------------------------------------------------
create table audit_logs (
  id         bigserial primary key,
  org_id     uuid,
  actor_id   uuid,
  action     text not null,              -- read | insert | update | delete
  table_name text not null,
  record_id  uuid,
  changes    jsonb,
  ip         inet,
  created_at timestamptz not null default now()
);

create or replace function audit_phi() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_logs (org_id, actor_id, action, table_name, record_id, changes)
  values (
    coalesce(new.org_id, old.org_id), auth.uid(), lower(tg_op), tg_table_name,
    coalesce(new.contact_id, old.contact_id),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger trg_audit_health after insert or update or delete
  on contact_health_profiles for each row execute function audit_phi();

-- ------------------------------------------------------------
-- 13. ROW LEVEL SECURITY  (multi-tenant from day one)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'orgs','profiles','contacts','contact_health_profiles','tags','contact_tags',
    'dispositions','disposition_history','pipelines','pipeline_stages','deals',
    'policies','activities','tasks','sequences','sequence_steps',
    'sequence_enrollments','message_templates','messages','appointments',
    'documents','ai_outputs','integrations','job_queue','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- one representative policy pattern; repeat per table with org_id
create policy org_isolation on contacts
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy org_isolation on activities
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy org_isolation on tasks
  for all using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- PHI: additionally restricted to owner/agent roles (assistants excluded)
create policy phi_access on contact_health_profiles
  for all using (
    org_id = current_org_id()
    and exists (select 1 from profiles p
                where p.id = auth.uid() and p.role in ('owner','agent'))
  );

-- ------------------------------------------------------------
-- 14. SEED: default dispositions & sequence
-- ------------------------------------------------------------
-- (run after first org is created; parameterize :org)
insert into dispositions (org_id, name, category, sort_order, is_terminal, pauses_sequences)
select o.id, d.name, d.category, d.ord, d.term, d.pause
from orgs o,
(values
  ('New Lead','active',1,false,false),
  ('Working Lead','active',2,false,false),
  ('Attempting Contact','active',3,false,false),
  ('Contacted','active',4,false,false),
  ('Qualified','active',5,false,false),
  ('DNQ','lost',6,true,true),
  ('Dead Lead','lost',7,true,true),
  ('No Contact','active',8,false,false),
  ('Wrong Number','lost',9,true,true),
  ('Disconnected','lost',10,true,true),
  ('Voicemail Left','active',11,false,false),
  ('Text Sent','active',12,false,false),
  ('Email Sent','active',13,false,false),
  ('Not Ready','active',14,false,false),
  ('Call Back Scheduled','active',15,false,true),
  ('Appointment Scheduled','active',16,false,true),
  ('Appointment Completed','active',17,false,false),
  ('Waiting On Documents','active',18,false,true),
  ('Application Started','active',19,false,true),
  ('Application Submitted','active',20,false,true),
  ('Policy Issued','won',21,true,true),
  ('Already Covered','lost',22,false,true),
  ('ACA Wrap','active',23,false,false),
  ('Supplemental','active',24,false,false),
  ('Dental Only','active',25,false,false),
  ('Vision Only','active',26,false,false),
  ('Life Insurance','active',27,false,false),
  ('Group Coverage','active',28,false,false),
  ('Lost Sale','lost',29,true,true),
  ('Future Opportunity','active',30,false,true),
  ('Do Not Contact','compliance',31,true,true),
  ('Referral','active',32,false,false),
  ('Existing Client','won',33,false,false),
  ('Renewal','active',34,false,false),
  ('Win Back','active',35,false,false)
) as d(name,category,ord,term,pause);
