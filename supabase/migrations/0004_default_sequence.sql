-- ============================================================
-- 0004_default_sequence.sql — Phase 7
-- The default follow-up ladder. branch_rules keys are task
-- outcomes; values are a step_order to jump to, "pause", or
-- "next" (default). The engine interprets them.
-- ============================================================

insert into sequences (id, org_id, name, is_default, active) values
  ('30000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'New Lead Follow-Up', true, true)
on conflict do nothing;

insert into sequence_steps (sequence_id, step_order, task_type, delay_hours, branch_rules) values
  -- Day 1: call. No answer → step 2 (text) immediately. Connected → pause (you take over).
  ('30000000-0000-0000-0000-000000000001', 1, 'call',  0,   '{"no_answer": 2, "voicemail": 2, "connected": "pause", "replied": "pause"}'),
  -- Day 1: text (fires right after an unanswered call)
  ('30000000-0000-0000-0000-000000000001', 2, 'text',  1,   '{"replied": "pause"}'),
  -- Day 2: email
  ('30000000-0000-0000-0000-000000000001', 3, 'email', 24,  '{"replied": "pause"}'),
  -- Day 4: call
  ('30000000-0000-0000-0000-000000000001', 4, 'call',  48,  '{"connected": "pause", "replied": "pause"}'),
  -- Day 7: text
  ('30000000-0000-0000-0000-000000000001', 5, 'text',  72,  '{"replied": "pause"}'),
  -- Day 14: call
  ('30000000-0000-0000-0000-000000000001', 6, 'call',  168, '{"connected": "pause", "replied": "pause"}'),
  -- Day 21: email
  ('30000000-0000-0000-0000-000000000001', 7, 'email', 168, '{"replied": "pause"}'),
  -- Day 30 / 60 / 90: long-tail touches
  ('30000000-0000-0000-0000-000000000001', 8, 'text',  216, '{"replied": "pause"}'),
  ('30000000-0000-0000-0000-000000000001', 9, 'email', 720, '{"replied": "pause"}'),
  ('30000000-0000-0000-0000-000000000001', 10,'call',  720, '{"connected": "pause", "replied": "pause"}')
on conflict do nothing;

-- Starter message templates used by text/email steps (merge vars: {{first_name}}, {{agent_name}})
insert into message_templates (org_id, name, channel, subject, body, category) values
  ('00000000-0000-0000-0000-000000000001', 'Follow-up text', 'text', null,
   'Hi {{first_name}}! It''s {{agent_name}}, your licensed health advisor. I have a couple of coverage options ready for you — when''s a good time for a quick call?', 'follow_up'),
  ('00000000-0000-0000-0000-000000000001', 'Follow-up email', 'email', 'Your health coverage options',
   'Hi {{first_name}},

I put together a couple of plan options based on what you shared. I''d love 10 minutes to walk you through them — reply here or grab a time that works for you.

Warmly,
{{agent_name}}', 'follow_up'),
  ('00000000-0000-0000-0000-000000000001', 'Birthday text', 'text', null,
   'Happy birthday, {{first_name}}! 🎉 Wishing you a wonderful year ahead. — {{agent_name}}', 'birthday'),
  ('00000000-0000-0000-0000-000000000001', 'Renewal email', 'email', 'Your policy renewal is coming up',
   'Hi {{first_name}},

Your policy renews soon and I want to make sure it still fits your life perfectly. Let''s do a quick review — it usually saves my clients money. When works for you?

Warmly,
{{agent_name}}', 'renewal')
on conflict do nothing;
