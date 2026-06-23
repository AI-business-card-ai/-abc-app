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
        primary: "#00d4d4",
        secondary: "#f0197d",
        accent: "#8b5cf6",
        bg: "#0d0f1a",
        surface: "#141628",
        "surface-hover": "#1c1f35",
        "abc-border": "rgba(139, 92, 246, 0.15)",
        muted: "#4a5168",
        "text-primary": "#f0f0ff",
        "text-secondary": "#8892b0",
        cyan: "#00d4d4",
        pink: "#f0197d",
        purple: "#8b5cf6",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(0, 212, 212, 0.25)",
        "glow-strong": "0 4px 30px rgba(139, 92, 246, 0.35)",
        "glow-purple": "0 0 16px rgba(139, 92, 246, 0.35)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #00d4d4, #8b5cf6)",
        "gradient-secondary": "linear-gradient(135deg, #f0197d, #8b5cf6)",
        "gradient-scan": "linear-gradient(135deg, #00d4d4, #f0197d)",
        "gradient-text": "linear-gradient(135deg, #00d4d4, #f0197d)",
        "gradient-logo": "linear-gradient(135deg, #00d4d4, #8b5cf6)",
      },
    },
  },
  plugins: [],
};

export default config;
