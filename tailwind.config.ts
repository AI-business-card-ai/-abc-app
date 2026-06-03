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
        "text-secondary": "#6B7280",
      },
    },
  },
  plugins: [],
};

export default config;
