import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ABC Card — approved dark premium palette */
        abc: {
          bg: "#0a0a0b",
          card: "#121214",
          raised: "#18181b",
          border: "#232326",
          "border-strong": "#2e2e33",
          text: "#ffffff",
          secondary: "#a1a1aa",
          muted: "#71717a",
          gold: "#e9a62f",
          "gold-accent": "#d9a441",
          violet: "#8b7cf6",
          green: "#4ade80",
          orange: "#fb923c",
          link: "#818cf8",
          today: "#f97316",
          upcoming: "#facc15",
          overdue: "#ef4444",
        },

        /* Legacy names kept so existing screens compile — remapped to gold */
        primary: "#e9a62f",
        secondary: "#d9a441",
        bg: "#0a0a0b",
        surface: "#121214",
        "surface-2": "#18181b",
        "surface-3": "#2e2e33",
        "abc-border": "#232326",
        "border-subtle": "#1b1b1e",
        muted: "#71717a",
        "text-primary": "#ffffff",
        "text-secondary": "#a1a1aa",
        cyan: "#d9a441",
        pink: "#e9a62f",
      },
      borderRadius: {
        card: "22px",
        inner: "15px",
        btn: "13px",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(233, 166, 47, 0.18)",
        "glow-strong": "0 6px 26px rgba(233, 166, 47, 0.28)",
        abc: "0 1px 2px rgba(0, 0, 0, 0.4)",
        "abc-raised": "0 12px 32px rgba(0, 0, 0, 0.5)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #e9a62f, #d9a441)",
        "gradient-secondary": "linear-gradient(135deg, #e9a62f, #d9a441)",
        "gradient-scan": "linear-gradient(135deg, #e9a62f, #d9a441)",
        "gradient-text": "linear-gradient(135deg, #e9a62f, #d9a441)",
        "gradient-logo": "linear-gradient(135deg, #e9a62f, #d9a441)",
        "abc-gold-glow":
          "radial-gradient(circle, rgba(233, 166, 47, 0.18), transparent 70%)",
      },
      transitionTimingFunction: {
        abc: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "abc-fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "abc-fade-up": "abc-fade-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
