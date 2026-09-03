import type { Config } from "tailwindcss";

// Every directory that can contain class names must be listed here. Missing one
// means its classes are never generated and that part of the UI renders unstyled.
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
