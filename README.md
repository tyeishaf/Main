# Advisory CRM — Phase 9 (Client book & settings)

Your AI-first operations hub for the health insurance advisory. Phases 4–8 built the Next.js frontend, the Supabase data layer, auth + RLS, the follow-up automation engine, and the Claude-powered assistant. Phase 9 adds the missing daily-driver pieces: a real **Clients** directory and a **Settings** page.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Deploy: push to GitHub → import in Vercel → done.

## What's implemented

- **Dashboard**: greeting with your name, rotating daily affirmation, AI morning briefing with tappable filter chips, "Before the day ends" must-do checklist, revenue/conversion/policy metrics, ranked **Hit list** of hot leads, and the Today task feed — every card showing disposition and last point of contact.
- **Contact detail**: header with last contact, one-tap **disposition picker** (terminal dispositions outlined in rose), full relationship timeline with AI summaries visually distinct in gold italic. Disposition changes log to the timeline instantly.
- **Draft sheet**: AI-drafted message with Approve & send / Edit (mocked; Phase 8 wires Claude).
- **Import**: connected sources (VanillaSoft + Textdrip, live auto-sync) plus one-time CSV/Excel upload with column mapping and sequence auto-enrollment.
- **Pipeline** board and **Calendar** day view.
- **Clients directory** (Phase 9): search your whole book by name, phone, or email; filter chips for Leads / Clients / Hot / Gone quiet / Do-not-contact; every row shows disposition, coverage, score, and last contact. Quick **+ Add** sheet creates a contact, dedupes against the book, and can enroll them in the follow-up sequence on the spot.
- **Settings** (Phase 9): edit the name the dashboard greets you by, see at a glance which connections (Supabase, Claude, Twilio, Gmail, cron engine, lead webhook) are live, and sign out.
- Responsive: phone-first, expands at `md:` for desktop.

## Architecture notes

- `lib/data.ts` is the **only** place the UI gets data. Phase 5 replaces each function body with Supabase queries; components don't change.
- `lib/types.ts` mirrors the Phase 2 Postgres schema, so swapping to generated Supabase types is mechanical.
- Theme lives entirely in `tailwind.config.ts` tokens (cream, blush, rose, mauve, plum, gold, champagne, sage). Gold is reserved for money, milestones, and AI moments.
- Server components fetch; small client components hold interaction state. Comments marked `Phase 5:` / `Phase 8:` flag every integration seam.

## Structure

```
app/
  page.tsx               dashboard (server)
  clients/page.tsx       client directory (server, ?q= search + ?f= filter)
  contacts/[id]/page.tsx contact detail (server)
  settings/page.tsx      profile + connection status (server)
  pipeline/page.tsx      calendar/page.tsx
  layout.tsx             fonts (Fraunces + Outfit), shell, bottom nav
  actions.ts             server actions (dispositions, tasks, import, add, AI)
  api/cron/*             engine ticks    api/webhooks/*  Twilio + lead intake
components/
  DashboardClient, MustDoList, HitList, TaskCard,
  DraftSheet, ImportSheet, AddContactSheet, ContactClient,
  ClientsClient, SettingsClient, Sheet, BottomNav
lib/
  types.ts  data.ts  supabase.ts  mock.ts  affirmations.ts
  ai/        claude.ts briefing.ts context.ts scoring.ts
  engine/    sequences.ts generators.ts guardrails.ts
  integrations/  twilio.ts gmail.ts leadSync.ts
```

## Phase history

5. **Backend** ✓ — Supabase project, migrations, `lib/data.ts` on live queries, server actions for dispositions/tasks/import.
6. **Auth** ✓ — Supabase Auth + RLS session wiring, protected routes, first-account org claim.
7. **Automations** ✓ — sequence engine (Vercel cron), Twilio + Gmail adapters, lead intake webhook + pollers, reply-pause guardrails.
8. **AI assistant** ✓ — Claude morning briefing + affirmation, drafts in your voice with tone feedback, contact summaries, nightly explainable lead scoring.
9. **Client book & settings** ✓ — searchable/filterable Clients directory, quick-add with dedupe + sequence enrollment, Settings page (profile name, connection status, sign out).

Candidate next phases: reporting (commission & conversion trends), appointment booking links, referral tracking.
