-- 0011_textdrip_settings.sql — Phase 17: in-app Textdrip config
-- Lets the advisor configure Textdrip from the app's Settings page
-- (no environment variables needed).

create table if not exists textdrip_settings (
  org_id        uuid primary key references orgs(id),
  api_key       text,
  campaign_id   text,
  endpoint      text,   -- add-to-campaign URL
  send_endpoint text,   -- send-SMS URL
  updated_at    timestamptz not null default now()
);
alter table textdrip_settings enable row level security;
drop policy if exists textdrip_settings_org_all on textdrip_settings;
create policy textdrip_settings_org_all on textdrip_settings for all
  using      (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
grant all on textdrip_settings to authenticated, service_role;
