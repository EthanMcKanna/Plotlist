/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#0D0F14",
          card: "#161A22",
          elevated: "#1C2028",
          border: "#2A2E38",
          hover: "#252930",
        },
        text: {
          primary: "#F1F3F7",
          secondary: "#9BA1B0",
          tertiary: "#5A6070",
          inverse: "#0D0F14",
        },
        // Resolved from the --brand-* CSS variables that AppearanceProvider
        // supplies (accent themes); values are R G B channel triplets so
        // opacity modifiers (e.g. bg-brand-500/10) still compose.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#F59E0B",
          muted: "#78510E",
        },
        status: {
          success: "#22C55E",
          danger: "#EF4444",
          warning: "#F59E0B",
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 4px 16px 0 rgba(0, 0, 0, 0.3)",
        elevated: "0 8px 32px 0 rgba(0, 0, 0, 0.4)",
        glow: "0 0 20px 0 rgb(var(--brand-glow) / 0.15)",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
    },
  },
  plugins: [],
};
