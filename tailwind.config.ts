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
        primary: "#7C3AED",
        secondary: "#0EA5E9",
        bg: "#07050E",
        card: "#0D0A18",
        "abc-border": "#1A0E30",
        muted: "#3A2060",
        "text-primary": "#F0EAFF",
        "text-secondary": "#8B7AA8",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(124, 58, 237, 0.4)",
        "glow-strong": "0 4px 30px rgba(124, 58, 237, 0.6)",
        "glow-purple": "0 0 16px rgba(124, 58, 237, 0.35)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #7C3AED, #0EA5E9)",
        "gradient-text": "linear-gradient(90deg, #A78BFA, #38BDF8)",
      },
    },
  },
  plugins: [],
};

export default config;
