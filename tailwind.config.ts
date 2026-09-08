import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: "hsl(var(--parchment))",
        ink: "hsl(var(--ink))",
        navy: "hsl(var(--navy))",
        brass: "hsl(var(--brass))",
        "paper-muted": "hsl(var(--paper-muted))",
        border: "hsl(var(--border))",
        surface: "hsl(var(--surface))",
        "surface-strong": "hsl(var(--surface-strong))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-noto-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-source-serif)", "var(--font-noto-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23, 32, 51, .04), 0 8px 24px rgba(23, 32, 51, .06)",
        lifted: "0 10px 30px rgba(23, 32, 51, .12)",
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
