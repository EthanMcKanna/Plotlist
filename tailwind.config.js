/** @type {import('tailwindcss').Config} */
module.exports = {
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
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
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
        glow: "0 0 20px 0 rgba(14, 165, 233, 0.15)",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
    },
  },
  plugins: [],
};
