-- ============================================================
-- 0005_engine_support.sql — Phase 7 helpers
-- ============================================================

-- Birthday lookup for the morning generator. SECURITY DEFINER so the
-- job can read the PHI table without widening client-side policies.
create or replace function contacts_with_birthday_today()
returns table (contact_id uuid, org_id uuid, first_name text)
language sql security definer set search_path = public as $$
  select c.id, c.org_id, c.first_name
  from contact_health_profiles h
  join contacts c on c.id = h.contact_id
  where h.date_of_birth is not null
    and to_char(h.date_of_birth, 'MM-DD') = to_char(current_date, 'MM-DD');
$$;

-- Speed up the engine's due-enrollment scan (partial index)
create index if not exists idx_enroll_active_due
  on sequence_enrollments (next_run_at)
  where status = 'active' and next_run_at is not null;
