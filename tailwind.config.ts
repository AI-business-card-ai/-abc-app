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
        /*
          ABC Card — champagne premium palette.

          These literals mirror the :root tokens in app/globals.css one for
          one. The duplication is pre-existing — components reach the palette
          through both Tailwind utilities (text-abc-text) and CSS variables
          (var(--abc-text)) — so both have to carry the same values or a screen
          ends up half lit. Change one, change the other.
        */
        abc: {
          bg: "#f7f1e6",
          card: "#fffdf8",
          raised: "#f4ecde",
          border: "#e7ddcb",
          "border-strong": "#d8cbb3",
          text: "#141414",
          secondary: "#625e57",
          muted: "#8a8178",
          gold: "#c99628",
          "gold-accent": "#a97d1c",
          violet: "#6d5bd0",
          green: "#2f8f57",
          orange: "#c2600f",
          link: "#a97d1c",
          today: "#c2600f",
          upcoming: "#8a6d08",
          overdue: "#c0271f",
        },

        /* Legacy names kept so existing screens compile — remapped to gold */
        primary: "#c99628",
        secondary: "#a97d1c",
        bg: "#f7f1e6",
        surface: "#fffdf8",
        "surface-2": "#f4ecde",
        "surface-3": "#d8cbb3",
        "abc-border": "#e7ddcb",
        "border-subtle": "#efe6d6",
        muted: "#8a8178",
        "text-primary": "#141414",
        "text-secondary": "#625e57",
        cyan: "#a97d1c",
        pink: "#c99628",
      },
      borderRadius: {
        card: "22px",
        inner: "15px",
        btn: "13px",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(201, 150, 40, 0.16)",
        "glow-strong": "0 6px 26px rgba(201, 150, 40, 0.24)",
        abc: "0 1px 2px rgba(20, 20, 20, 0.06)",
        "abc-raised": "0 14px 34px rgba(20, 20, 20, 0.10)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #c99628, #a97d1c)",
        "gradient-secondary": "linear-gradient(135deg, #c99628, #a97d1c)",
        "gradient-scan": "linear-gradient(135deg, #c99628, #a97d1c)",
        "gradient-text": "linear-gradient(135deg, #c99628, #a97d1c)",
        "gradient-logo": "linear-gradient(135deg, #c99628, #a97d1c)",
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
