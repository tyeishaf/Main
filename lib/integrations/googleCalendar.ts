/**
 * Google Calendar adapter — reads your upcoming events so client
 * appointments show up in the app. Reuses your Google OAuth app (the
 * same one Gmail uses); only the refresh token is calendar-specific.
 *
 * Env:
 *   GOOGLE_CALENDAR_REFRESH_TOKEN   (calendar-scoped refresh token)
 *   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET   (reused)  — or
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * One-time OAuth walkthrough in SETUP.md.
 */

const clientId = () => process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;

export function calendarConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN);
}

export interface GCalEvent {
  id: string;
  title: string;
  startISO: string;      // event start (date or datetime)
  allDay: boolean;
  location: string | null;
  attendees: string[];   // email addresses
  color: string;         // hex, from the event or its calendar
}

// Google Calendar event color palette (colorId → hex)
const GCAL_COLORS: Record<string, string> = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

async function accessToken(): Promise<{ token: string | null; error?: string }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId()!,
        client_secret: clientSecret()!,
        refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    const json: any = await res.json();
    if (!res.ok || !json.access_token)
      return { token: null, error: `sign-in failed (${json.error ?? res.status}) — check the Client ID/Secret and refresh token match` };
    return { token: json.access_token };
  } catch (e: any) {
    return { token: null, error: `network error reaching Google (${e?.message ?? "?"})` };
  }
}

export interface FetchResult { events: GCalEvent[]; error?: string; scanned?: number }

/** Events across ALL your calendars, within [sinceISO, sinceISO + days]. */
export async function fetchUpcoming(days = 45, sinceISO?: string): Promise<FetchResult> {
  if (!calendarConfigured()) return { events: [], error: "not configured" };
  const { token, error } = await accessToken();
  if (!token) return { events: [], error };

  const start = sinceISO ? new Date(sinceISO) : new Date();
  const timeMax = new Date(start.getTime() + days * 86_400_000);

  // list the user's calendars, then pull events from each (handles events
  // that live on a secondary calendar rather than "primary")
  let calendars: { id: string; color: string }[] = [{ id: "primary", color: "#039be5" }];
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (listRes.ok) {
      const lj: any = await listRes.json();
      const cals = (lj.items ?? [])
        .filter((c: any) => c.id)
        .map((c: any) => ({ id: c.id, color: c.backgroundColor || "#039be5" }));
      if (cals.length) calendars = cals;
    }
  } catch { /* fall back to primary */ }
  const calendarIds = calendars.map((c) => c.id);
  const calColor = new Map(calendars.map((c) => [c.id, c.color]));

  const all: GCalEvent[] = [];
  let firstError: string | undefined;
  for (const calId of calendarIds) {
    const params = new URLSearchParams({
      timeMin: start.toISOString(), timeMax: timeMax.toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "100",
    });
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        if (!firstError) firstError = `Google API ${res.status} (${body?.error?.message ?? "?"})`;
        continue;
      }
      const json: any = await res.json();
      for (const e of json.items ?? []) {
        if (e.status === "cancelled" || !(e.start?.dateTime || e.start?.date)) continue;
        all.push({
          id: e.id,
          title: e.summary || "(no title)",
          startISO: e.start.dateTime || e.start.date,
          allDay: !e.start.dateTime,
          location: e.location ?? null,
          attendees: (e.attendees ?? []).map((a: any) => a.email).filter(Boolean),
          color: (e.colorId && GCAL_COLORS[e.colorId]) || calColor.get(calId) || "#039be5",
        });
      }
    } catch (err: any) {
      if (!firstError) firstError = `fetch failed (${err?.message ?? "?"})`;
    }
  }

  all.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());
  return { events: all, error: all.length === 0 ? firstError : undefined, scanned: calendarIds.length };
}
