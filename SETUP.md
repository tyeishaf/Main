# Phase 5 Setup — Connect Supabase (15 minutes)

The app runs on mock data until these steps are done, so nothing is blocked in the meantime.

## 1. Create the project
1. Go to https://supabase.com → New project.
2. Name it (e.g. `advisory-crm`), pick a strong database password, choose the region closest to you (US East for Georgia).
3. Wait ~2 minutes for provisioning.

## 2. Run the migrations
1. In the Supabase dashboard, open **SQL Editor**.
2. Paste the contents of `supabase/migrations/0001_init.sql` → Run.
3. Paste `supabase/migrations/0002_seed.sql` → Run. (This creates the demo org "Tyeisha Advisory" with sample leads, tasks, pipeline, and policies so the app boots with something real. Delete the sample rows anytime.)
4. **Database → Extensions**: enable `pg_cron` (used by Phase 7's follow-up engine).

## 3. Get your keys
**Project Settings → API**:
- Project URL → `SUPABASE_URL`
- `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the browser — the app only uses it inside server components and server actions)

## 4. Configure the app
```bash
cp .env.example .env.local
# paste your two values into .env.local
npm install
npm run dev
```
Reload http://localhost:3000 — the dashboard is now reading your database. Change a disposition, check off a must-do, or import a CSV: refresh, and it sticks.

## 5. Deploy (optional now, required eventually)
In Vercel → Project → Settings → Environment Variables, add the same two variables, then redeploy.

## What's temporary (by design)
- `DEFAULT_ORG_ID` scopes every query to your org while you're the only user. **Phase 6 (Auth)** replaces the service-role client with a session-bound client and Row-Level Security enforces org isolation at the database — the queries don't change because they already filter by org.
- The briefing paragraph is assembled from live counts by a template. **Phase 8** replaces it with the Claude-written morning note.

---

# Phase 6 Setup — Authentication (10 minutes)

## 1. Run the auth migration
SQL Editor → paste `supabase/migrations/0003_auth.sql` → Run.

## 2. Update your environment variable names
Phase 6 switches to the browser-safe anon key + RLS. In `.env.local` (and Vercel):
- `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the `anon` public key (Project Settings → API)
- keep `SUPABASE_SERVICE_ROLE_KEY` (server-only; Phase 7 jobs use it)
- `DEFAULT_ORG_ID` is no longer used — delete it.

## 3. Configure auth
Supabase dashboard → **Authentication**:
- **URL Configuration**: Site URL = `http://localhost:3000` (add your Vercel URL when you deploy). Add `http://localhost:3000/auth/callback` to Redirect URLs.
- Email provider is on by default. Optional: under Providers → Email, disable "Confirm email" for instant sign-in during development.

## 4. Create YOUR account
`npm install && npm run dev` → you'll be redirected to `/login` → **Create your account**.
The very first account automatically claims the seeded "Tyeisha Advisory" org and all its data, as `owner`. Anyone else who signs up gets a fresh, empty org — they can never see yours: Row-Level Security enforces isolation inside Postgres itself, not in app code.

## What changed under the hood
- Every page and action now queries as *you* (session-bound client). The service-role key is reserved for background jobs.
- Your name on the dashboard comes from your profile (Settings-editable later).
- MFA can be enabled anytime in Supabase Auth settings — recommended once real client data is in (HIPAA posture).

---

# Phase 7 Setup — Automations

## 1. Migrations
SQL Editor → run `0004_default_sequence.sql`, then `0005_engine_support.sql`.

## 2. Secrets
Generate two long random strings and add to `.env.local` + Vercel:
`CRON_SECRET` (protects the engine endpoints) and `LEADS_WEBHOOK_KEY` (protects the lead intake URL). In Vercel, also set `CRON_SECRET` under Settings → Environment Variables — Vercel Cron sends it automatically as the Authorization header.

## 3. Twilio (texting) — ~20 min
1. twilio.com → buy a local number (~$1.15/mo + ~$0.008/text).
2. Copy Account SID + Auth Token into env; number into `TWILIO_FROM_NUMBER`.
3. On the number: Messaging → "A message comes in" → Webhook →
   `https://YOUR-APP.vercel.app/api/webhooks/twilio`
4. **Important (US law):** register for A2P 10DLC in the Twilio console before texting leads — it's a form, takes a few days to approve, and keeps you compliant with TCPA/carrier rules.

## 4. Gmail (emailing as you) — ~20 min
1. console.cloud.google.com → new project → enable **Gmail API**.
2. OAuth consent screen (External, just you) → Credentials → OAuth Client ID (Web) with redirect `https://developers.google.com/oauthplayground`.
3. In the OAuth Playground (gear icon → use your own credentials), authorize scope `https://www.googleapis.com/auth/gmail.send`, exchange for tokens, copy the **refresh token**.
4. Fill the four `GMAIL_*` env vars.

## 5. VanillaSoft + Textdrip — no more manual downloads
**Preferred — push (instant):** point each vendor (native webhook, or a 2-step Zapier/Make zap: "New lead in VanillaSoft → POST webhook") at:
`https://YOUR-APP.vercel.app/api/webhooks/leads?key=YOUR_LEADS_WEBHOOK_KEY&source=vanillasoft`
(and `&source=textdrip` for Textdrip). Field names are auto-normalized; duplicates merge; every new lead is enrolled in the follow-up sequence within seconds.
**Fallback — pull:** if your plan exposes a REST "list new leads" endpoint, fill the `VANILLASOFT_*` / `TEXTDRIP_*` env vars and the 10-minute poller takes over (`lib/integrations/leadSync.ts` marks exactly where to paste the endpoint).

## 6. What runs on its own now
- **Every 15 min** the engine materializes due sequence steps: calls appear as tasks; texts/emails auto-send (guardrails: quiet hours 9a–8p, Do-Not-Contact hard stop, max 1 automated message per lead per 20h) or fall back to tasks if an integration isn't connected.
- **Every 10 min** vendor polling (if configured).
- **Daily 6–7am ET** birthdays, ≤30-day renewals, and cold-lead rescues become tasks.
- **The instant a lead texts back**, all automation for them pauses and an urgent "Respond — they replied!" task appears. Recording a call outcome (Connected / Voicemail / No answer) branches the sequence automatically.

---

# Phase 8 Setup — AI Assistant (5 minutes)

## 1. Get a Claude API key
console.anthropic.com → API Keys → create key → add to `.env.local` and Vercel as `ANTHROPIC_API_KEY`.

## 2. That's it — what turns on
- **Morning briefing**: the 6am job now ends with Claude reading your finished day plan (tasks, appointments, renewals) and writing the dashboard note — real names, real counts, and who to start with. Falls back to the template if the key is missing or the job hasn't run.
- **Daily affirmation**: generated fresh each morning alongside the briefing.
- **Drafts in your voice**: the Draft button builds a context pack (lead profile + timeline + your open tasks — **never** DOB, income, or health conditions) and writes the message. Edit before approving: your edits are saved and fed back as tone examples, so drafts sound more like you every week. Approve & send fires Twilio/Gmail if connected; otherwise it logs the approved message for you to send manually. Either way, automation pauses for that lead.
- **Summarize ✦** on any contact: 2-3 sentence relationship summary + best next move, saved to the timeline in gold.
- **Nightly lead scoring**: deterministic base (engagement recency, budget shared, coverage value, source quality) + Claude's read of the conversation for buying signals. Every score stores its reasons in `score_reasons` — the hit list is always explainable.

## Cost expectations
All prompts are small and batched: with a book of a few hundred leads, expect roughly **$3–10/month** in API usage. The nightly scorer caps at 20 leads/night by design; raise the batch in `lib/ai/scoring.ts` if you want faster full-book refreshes.

## Guardrails built in
Claude is instructed to never invent plan details, prices, or compliance-risky promises, and only sees facts already in your CRM. PHI (DOB, income, conditions) is structurally excluded from every AI context.

---

# Phase 9 — Client book & settings (nothing to set up)

Phase 9 is pure app code — deploy and it's live. What's new:

- **Clients tab** now opens your real book: search by name, phone, or email; filter by Leads, Clients, Hot (score ≥ 70), Gone quiet (9+ days silent, longest-silent first — those are the saves), or Do-not-contact. Every row links to the contact's timeline.
- **+ Add** creates a contact in seconds. It dedupes by phone/email against your whole book (matching the CSV import rule), and the "Enroll in follow-up sequence" toggle drops them straight into the Phase 7 engine — the Day-1 call task appears immediately.
- **Settings tab**: change the name the dashboard greets you by, see which connections are live (Supabase, Claude, Twilio, Gmail, cron engine, lead webhook — each pointing at its setup section above), and sign out.

Housekeeping in this phase: removed the unused Phase 5 scaffolding (`lib/data_new.ts`, `lib/supabase/server.ts`, `lib/format.ts`) — `lib/data.ts` + `lib/supabase.ts` have been the real data layer since Phase 6.

---

# Phase 10 — Reporting & trends (nothing to set up)

Pure app code — deploy and it's live. Tap the **Overview** row on the dashboard (the This month / Conversion / Policies tiles) to open **Reports**:

- **Commission trend** — the last 6 months of commission recognized (annual commission ÷ 12, bucketed by each policy's effective date), with policies-sold underneath.
- **Deal outcomes** — won / lost / open at a glance, and the win rate (won ÷ closed).
- **Where your closes come from** — every lead source ranked by volume, with its close rate, so you can see which sources are worth the spend.
- **Premium in play** — open monthly premium by pipeline stage.

Everything is derived server-side from tables you already have (`policies`, `deals`, `contacts`, `pipeline_stages`) under RLS — no new migrations, no new API keys. In sample mode it shows representative numbers; once Supabase is connected it's your real book.

---

# Deploying on Vercel's free (Hobby) plan — cron limits

Vercel Hobby only runs cron jobs **once per day**. The follow-up engine was
originally set to tick every 15 min, which Hobby rejects at deploy time, so
`vercel.json` now uses daily schedules:

- `/api/cron/tick` — daily (materializes due sequence steps; auto-sends texts/emails)
- `/api/cron/morning` — daily ~6–7am ET (briefing + affirmation)
- `/api/cron/nightly` — daily (lead scoring)

**What this means:** on the free plan, follow-up steps fire once a day instead
of within ~15 min. That's fine for seeing the app and light use. Lead *intake*
is unaffected — the `/api/webhooks/leads` push webhook still enrolls new leads
instantly (it isn't a cron).

**To get near-real-time automation back**, either:
1. **Upgrade to Vercel Pro** and restore the frequent schedules in `vercel.json`:
   `"*/15 * * * *"` for `tick` and add `{ "path": "/api/cron/sync", "schedule": "*/10 * * * *" }`; or
2. **Keep Hobby and use a free external scheduler** (e.g. cron-job.org, EasyCron,
   or a GitHub Actions scheduled workflow) to `GET` your endpoints every 15 min
   with header `Authorization: Bearer <CRON_SECRET>`:
   `https://YOUR-APP.vercel.app/api/cron/tick`

The `/api/cron/sync` vendor poller was dropped from the daily set because push
webhooks already handle leads in real time; re-add it via option 1 or 2 only if
you rely on the pull-based fallback.

---

# Phase 13 — Google Calendar (read your appointments)

Your upcoming Google Calendar events show on the **Calendar** tab, and any event whose attendee email or title matches a client links straight to their record (with their current status).

## 1. Google Cloud project (reuse the Gmail one if you made it)
1. console.cloud.google.com → your project (or **New project**)
2. **APIs & Services → Library** → enable **Google Calendar API**
3. **OAuth consent screen**: External, add yourself as a test user (if not already)
4. **Credentials → OAuth Client ID (Web)** with redirect `https://developers.google.com/oauthplayground` (reuse your Gmail client if you have one)

## 2. Get a calendar refresh token
1. developers.google.com/oauthplayground → gear (top-right) → check **Use your own OAuth credentials**, paste your Client ID + Secret
2. In the scope box on the left, authorize: `https://www.googleapis.com/auth/calendar.readonly`
3. **Exchange authorization code for tokens** → copy the **Refresh token**

## 3. Env vars (Vercel → Settings → Environment Variables)
- `GOOGLE_CALENDAR_REFRESH_TOKEN` = the refresh token from step 2
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` = your OAuth client id/secret
  *(if you already set `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` for the same OAuth app, those are reused automatically — you only need the refresh token)*

Redeploy. The Calendar tab switches from the "Connect" card to your live upcoming events. Read-only for now (viewing); creating events from the app can come later.
