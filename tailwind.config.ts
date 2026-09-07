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
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // One surface scale. Higher number = closer to the viewer.
      colors: {
        base: "rgb(var(--c-base) / <alpha-value>)",
        s1: "rgb(var(--c-s1) / <alpha-value>)",
        s2: "rgb(var(--c-s2) / <alpha-value>)",
        s3: "rgb(var(--c-s3) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-2": "rgb(var(--c-ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--c-ink-3) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--c-accent-ink) / <alpha-value>)",
        live: "rgb(var(--c-live) / <alpha-value>)",
        cool: "rgb(var(--c-cool) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
      },
      // 12px floor. Nothing in this product renders below `xs`.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.8125rem", { lineHeight: "1.15rem" }],
        base: ["0.9375rem", { lineHeight: "1.45rem" }],
        lg: ["1.0625rem", { lineHeight: "1.5rem" }],
        xl: ["1.3125rem", { lineHeight: "1.75rem", letterSpacing: "-0.011em" }],
        "2xl": ["1.75rem", { lineHeight: "2.1rem", letterSpacing: "-0.02em" }],
        "3xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }],
      },
      borderRadius: { lg: "0.5rem", xl: "0.625rem", "2xl": "0.75rem", "3xl": "0.875rem", "4xl": "1rem" },
      boxShadow: {
        lift: "0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 1px 2px 0 rgb(0 0 0 / 0.4)",
        panel: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 8px 30px -12px rgb(0 0 0 / 0.9)",
        orb: "0 0 0 1px rgb(255 255 255 / 0.08) inset, 0 6px 24px -10px rgb(var(--c-accent) / 0.45)",
        "orb-live": "0 0 0 1px rgb(255 255 255 / 0.08) inset, 0 6px 26px -8px rgb(var(--c-live) / 0.5)",
      },
      transitionTimingFunction: { snap: "cubic-bezier(0.22, 1, 0.36, 1)" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "slide-up": { from: { transform: "translateY(14px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        breathe: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: {
        "fade-up": "fade-up 0.32s cubic-bezier(0.22,1,0.36,1) both",
        "slide-up": "slide-up 0.28s cubic-bezier(0.22,1,0.36,1) both",
        breathe: "breathe 1.8s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
