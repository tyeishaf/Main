-- ============================================================
-- 0003_auth.sql — Phase 6: Authentication
-- 1) Auto-provision profile + org on signup
-- 2) Complete RLS coverage for every org-scoped table
-- ============================================================

-- ------------------------------------------------------------
-- 1. New-user provisioning
--    First user to sign up claims the seeded org (Tyeisha Advisory)
--    if it has no members yet; later users get their own org.
--    (Multi-agent invites arrive with agency features later.)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seed_org uuid := '00000000-0000-0000-0000-000000000001';
  target_org uuid;
begin
  if exists (select 1 from orgs where id = seed_org)
     and not exists (select 1 from profiles where org_id = seed_org) then
    target_org := seed_org;
  else
    insert into orgs (name) values (coalesce(new.email, 'My Advisory')) returning id into target_org;
  end if;

  insert into profiles (id, org_id, role, full_name)
  values (new.id, target_org, 'owner',
          coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. RLS policies for tables not covered in 0001
--    (contacts, activities, tasks, contact_health_profiles done)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'dispositions','disposition_history','tags','deals','policies',
    'pipelines','sequences','sequence_enrollments','message_templates',
    'messages','appointments','documents','ai_outputs','integrations','job_queue'
  ] loop
    begin
      execute format(
        'create policy org_isolation on %I for all
           using (org_id = current_org_id())
           with check (org_id = current_org_id())', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Tables without their own org_id: scope through the parent
do $$ begin
  create policy org_isolation on pipeline_stages for all
    using (exists (select 1 from pipelines p
                   where p.id = pipeline_id and p.org_id = current_org_id()))
    with check (exists (select 1 from pipelines p
                        where p.id = pipeline_id and p.org_id = current_org_id()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy org_isolation on sequence_steps for all
    using (exists (select 1 from sequences s
                   where s.id = sequence_id and s.org_id = current_org_id()))
    with check (exists (select 1 from sequences s
                        where s.id = sequence_id and s.org_id = current_org_id()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy org_isolation on contact_tags for all
    using (exists (select 1 from contacts c
                   where c.id = contact_id and c.org_id = current_org_id()))
    with check (exists (select 1 from contacts c
                        where c.id = contact_id and c.org_id = current_org_id()));
exception when duplicate_object then null; end $$;

-- Orgs: members can see their own org row
do $$ begin
  create policy member_read on orgs for select
    using (id = current_org_id());
exception when duplicate_object then null; end $$;

-- Profiles: read colleagues in your org; edit only yourself
do $$ begin
  create policy same_org_read on profiles for select
    using (org_id = current_org_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy self_update on profiles for update
    using (id = auth.uid()) with check (id = auth.uid());
exception when duplicate_object then null; end $$;

-- Audit logs: owner-only read, no client writes (triggers write as definer)
do $$ begin
  create policy owner_read on audit_logs for select
    using (org_id = current_org_id() and exists
      (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'));
exception when duplicate_object then null; end $$;
