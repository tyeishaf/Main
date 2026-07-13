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
}

async function accessToken(): Promise<string | null> {
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
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/** Upcoming events from the primary calendar, from now through `days` ahead. */
export async function fetchUpcomingEvents(days = 21): Promise<GCalEvent[]> {
  if (!calendarConfigured()) return [];
  const token = await accessToken();
  if (!token) return [];

  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json.items ?? [])
      .filter((e: any) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
      .map((e: any): GCalEvent => ({
        id: e.id,
        title: e.summary || "(no title)",
        startISO: e.start.dateTime || e.start.date,
        allDay: !e.start.dateTime,
        location: e.location ?? null,
        attendees: (e.attendees ?? []).map((a: any) => a.email).filter(Boolean),
      }));
  } catch {
    return [];
  }
}
