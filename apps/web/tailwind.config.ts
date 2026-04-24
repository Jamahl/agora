import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { 900: "#0B0D10", 700: "#1F2429", 500: "#44505C", 300: "#8A96A3" },
        surface: { 0: "#FFFFFF", 50: "#F6F7F9", 100: "#EEF0F3", 200: "#E2E6EB" },
        accent: { 500: "#2F5BEA", 400: "#5A7BF0" },
        danger: { 500: "#D64545" },
        warn: { 500: "#D98613" },
        ok: { 500: "#2F8F4E" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
