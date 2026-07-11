-- ============================================================
-- 0002_seed.sql — Demo org + working data so the app boots
-- with something real. Safe to delete rows later; the fixed
-- org UUID is referenced by DEFAULT_ORG_ID in .env until
-- Phase 6 replaces it with the authenticated user's org.
-- ============================================================

insert into orgs (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Tyeisha Advisory')
on conflict do nothing;

-- Dispositions for this org (the 0001 seed only fills orgs that
-- existed at migration time, so we insert here explicitly)
insert into dispositions (org_id, name, category, sort_order, is_terminal, pauses_sequences)
select '00000000-0000-0000-0000-000000000001', d.name, d.category, d.ord, d.term, d.pause
from (values
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
  ('Lost Sale','lost',29,true,true),
  ('Future Opportunity','active',30,false,true),
  ('Do Not Contact','compliance',31,true,true),
  ('Referral','active',32,false,false),
  ('Existing Client','won',33,false,false),
  ('Renewal','active',34,false,false),
  ('Win Back','active',35,false,false)
) as d(name,category,ord,term,pause)
on conflict do nothing;

-- Contacts
insert into contacts (id, org_id, lifecycle, first_name, last_name, phone, email, state,
  coverage_type, budget_monthly, lead_source, lead_score, notes,
  current_disposition_id, last_contact_at)
values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','lead','Marisol','Vega','555-0101','marisol@example.com','GA', array['family'], 450, 'Facebook ad', 86, 'Newborn arriving Oct. Husband self-employed.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Qualified'), now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','lead','Devon','Price','555-0102','devon@example.com','GA', array['family'], null, 'VanillaSoft', 74, 'Answers after work; promised 4pm callback.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Voicemail Left'), now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','lead','Anita','Rowe','555-0103','anita@example.com','FL', array['dental'], 60, 'Referral', 81, 'Asked for dental quote.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Contacted'), now() - interval '1 day'),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','lead','Bright Path','Daycare','555-0104','office@brightpath.example','GA', array['group'], null, 'Networking', 68, 'Group plan, 8 lives. Waiting on census sheet.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Waiting On Documents'), now() - interval '4 days'),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','client','Gloria','Simmons','555-0105','gloria@example.com','GA', array['supplemental'], null, 'Referral', 90, 'Long-time client.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Existing Client'), now() - interval '28 days'),
  ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','client','Paul','Nguyen','555-0106','paul@example.com','TX', array['individual'], null, 'Website', 55, 'Client since 2024.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Existing Client'), now() - interval '41 days'),
  ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','client','Harper','Family','555-0107','harpers@example.com','GA', array['individual'], null, 'Referral', 88, 'ACA plan renews Aug 1.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Renewal'), now() - interval '12 days'),
  ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','lead','Jess','Whitfield','555-0108','jess@example.com','FL', array['supplemental'], null, 'Textdrip', 62, 'Said not ready in June.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Not Ready'), now() - interval '12 days'),
  ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','lead','Tomás','Rivera','555-0109','tomas@example.com','GA', array['individual'], 380, 'Facebook ad', 71, 'Quote sent Jul 1, no reply.',
    (select id from dispositions where org_id='00000000-0000-0000-0000-000000000001' and name='Text Sent'), now() - interval '9 days')
on conflict do nothing;

-- Birthdays (PHI table)
insert into contact_health_profiles (contact_id, org_id, date_of_birth) values
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001', (current_date - interval '64 years')::date),
  ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001', (current_date - interval '38 years')::date)
on conflict do nothing;

-- Today's tasks
insert into tasks (org_id, contact_id, type, title, description, priority, due_at, source) values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','call','Day 4 follow-up — Marisol','Family plan, budget ~$450/mo','high', now() + interval '2 hours','sequence'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','call','Devon Price callback at 4:00p','You promised this time — he answers after work','urgent', date_trunc('day', now()) + interval '16 hours','manual'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','text','Send dental quote options','Asked for dental quote','normal', now() + interval '3 hours','sequence'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','email','Census sheet reminder','Group quote expires Monday','urgent', now() + interval '1 hour','manual'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','call','Birthday call — Gloria','Turns 64 today; Medicare timeline convo','urgent', now() + interval '90 minutes','automation'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','text','Birthday text — Paul','Client since 2024','normal', now() + interval '5 hours','automation'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','call','Schedule Harper renewal review','Renews Aug 1 — book before their weekend','high', now() + interval '4 hours','automation'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008','call','Check in — was Not Ready','No contact in 12 days','normal', now() + interval '6 hours','sequence'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','text','Nudge on quote','Quote sent, no reply in 9 days','normal', now() + interval '6 hours','sequence');

-- Pipeline
insert into pipelines (id, org_id, name) values
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Sales')
on conflict do nothing;

insert into pipeline_stages (id, pipeline_id, name, sort_order, win_probability) values
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','New',1,0.10),
  ('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Contacted',2,0.25),
  ('21000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Quoted',3,0.45),
  ('21000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','Application',4,0.80),
  ('21000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','Issued',5,1.00)
on conflict do nothing;

insert into deals (org_id, contact_id, pipeline_id, stage_id, product_type, est_monthly_premium) values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000002','family',520),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000003','dental',60),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000003','individual',380),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000003','individual',610),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000004','group',2400);

-- Policies (revenue + renewals)
insert into policies (org_id, contact_id, product_type, carrier, status, monthly_premium, annual_commission, effective_date, renewal_date) values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','individual','BlueChoice','active',610,1440,'2025-08-01','2026-08-01'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','supplemental','Aflex','active',89,320, '2024-03-01','2027-03-01'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','individual','Ambetter','active',402,980,'2024-11-01','2026-11-01');

-- Timeline for Marisol
insert into activities (org_id, contact_id, type, direction, outcome, body, occurred_at) values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','system','internal','none','New lead · Source: Facebook ad ''Family Coverage''', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','sms','outbound','opened','Text sent · intro + scheduling link', now() - interval '4 days'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','call','outbound','connected','Call · 6 min · Discussed family plan options, wants under $450/mo', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','note','internal','none','Husband self-employed. Check subsidy eligibility.', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','ai_summary','internal','none','Marisol is price-sensitive but motivated — newborn arriving in Oct. Best angle: family plan with strong pediatric coverage.', now() - interval '2 hours');

-- Appointments today
insert into appointments (org_id, contact_id, title, starts_at) values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Zoom · Anita Rowe — dental options', date_trunc('day', now()) + interval '10 hours 30 minutes'),
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','Call · Harper family renewal review', date_trunc('day', now()) + interval '13 hours'),
  ('00000000-0000-0000-0000-000000000001',null,'New consult · Calendly booking (Kira B.)', date_trunc('day', now()) + interval '15 hours 30 minutes');
