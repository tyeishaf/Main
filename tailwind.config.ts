import type { Config } from "tailwindcss";

/**
 * Design tokens — the single source of truth for the luxury theme.
 * Gold is reserved for money, milestones, and AI moments.
 * Rose/mauve carry the human relationship layer.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF6F2",      // app background
        blush: "#F3E3E0",      // dusty rose soft
        rose: "#D9A7A0",       // dusty rose
        mauve: "#8A6E7F",
        plum: "#3E2E3A",       // ink / primary text
        gold: "#C2A05C",
        champagne: "#F0E6D2",  // gold soft
        sage: "#9DAF9A",
        fog: "#B5A49C",        // muted metadata text
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 24px rgba(62,46,58,0.08)",
      },
      borderRadius: {
        card: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
