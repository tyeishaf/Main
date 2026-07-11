/** Humanize timestamps for "last contact" lines. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "No contact yet";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const label = new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${label} (${days} days ago)`;
  return `${label} (${Math.round(days / 7)} wks ago)`;
}

export function clock(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "")
    .replace("m", ""); // 10:30a
}
