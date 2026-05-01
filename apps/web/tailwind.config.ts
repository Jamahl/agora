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
        accent: { 700: "#7A4FA8", 500: "#9B6FD9", 400: "#B08FE8", 200: "#D9C8F5", 100: "#E9DDFE", 50: "#F6F0FF" },
        lilac: { 700: "#7A4FA8", 500: "#9B6FD9", 400: "#B08FE8", 200: "#D9C8F5", 100: "#E9DDFE", 50: "#F6F0FF" },
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
