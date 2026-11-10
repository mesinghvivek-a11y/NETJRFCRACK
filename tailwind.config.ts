import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12262E",
        page: "#F2F5F4",
        surface: "#FFFFFF",
        line: "#DCE3E1",
        muted: "#5B6B70",
        primary: { DEFAULT: "#0F6E7C", ink: "#0A4F5A", wash: "#E4F1F3" },
        ochre: "#C98B1F",
        danger: "#B3412F",
        good: "#2E7D4F",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
