# Advisory CRM — Phase 4 (Frontend)

Your AI-first operations hub for the health insurance advisory. This phase is the complete Next.js frontend running on typed mock data. Phases 5–8 swap the data layer for Supabase, wire auth, the follow-up engine, and the Claude-powered assistant — without changing this component tree.

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
  contacts/[id]/page.tsx contact detail (server)
  pipeline/page.tsx      calendar/page.tsx
  layout.tsx             fonts (Fraunces + Outfit), shell, bottom nav
components/
  DashboardClient, MustDoList, HitList, TaskCard,
  DraftSheet, ImportSheet, ContactClient, Sheet, BottomNav
lib/
  types.ts  data.ts  affirmations.ts
```

## Next phases

5. **Backend** — Supabase project, run the Phase 2 migration, replace `lib/data.ts` internals, server actions for dispositions/tasks.
6. **Auth** — Supabase Auth + RLS session wiring, protected routes.
7. **Automations** — sequence engine (pg_cron), Twilio + Gmail adapters, VanillaSoft/Textdrip sync jobs, webhook routes.
8. **AI assistant** — daily briefing job, draft endpoint with tone profile, lead scoring, generated affirmations.
