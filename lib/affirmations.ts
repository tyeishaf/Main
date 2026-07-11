/**
 * Daily affirmation. Rotates deterministically by date so it's stable
 * all day and fresh tomorrow. Phase 8 upgrades this to a Claude-generated
 * mantra tuned to the week's pipeline and energy.
 */
const AFFIRMATIONS = [
  "Every call I make today is a door I'm opening for someone's family.",
  "I don't chase — I attract. My expertise speaks before I do.",
  "One conversation today will change someone's life. I'll be ready for it.",
  "I am the calm, confident advisor my clients trust with what matters most.",
  "Rejection is redirection. The right yes is already on my list.",
  "I protect families for a living. I move like it.",
  "Today I follow up like fortunes depend on it — because they do.",
  "My pipeline reflects my discipline, and my discipline is elite.",
  "I close with care, not pressure. That's why my clients stay.",
  "Small consistent actions today build the agency I'm dreaming of.",
];

export function affirmationForToday(date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  return AFFIRMATIONS[dayOfYear % AFFIRMATIONS.length];
}
