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
        bg: "#0f0f0f",
        surface: "#1a1a1a",
        "surface-2": "#242424",
        "surface-3": "#2a2a2a",
        "abc-border": "#2a2a2a",
        "border-subtle": "#1f1f1f",
        muted: "#555555",
        "text-primary": "#ffffff",
        "text-secondary": "#999999",
        cyan: "#00d4d4",
        pink: "#f0197d",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(240, 25, 125, 0.2)",
        "glow-strong": "0 4px 24px rgba(0, 212, 212, 0.2)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #f0197d, #00d4d4)",
        "gradient-secondary": "linear-gradient(135deg, #f0197d, #00d4d4)",
        "gradient-scan": "linear-gradient(135deg, #f0197d, #00d4d4)",
        "gradient-text": "linear-gradient(135deg, #f0197d, #00d4d4)",
        "gradient-logo": "linear-gradient(135deg, #f0197d, #00d4d4)",
      },
    },
  },
  plugins: [],
};

export default config;
