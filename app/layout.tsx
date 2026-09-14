import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  axes: ["opsz"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "The Producer",
  description: "Talk a song into existence. A conversational AI producer that builds the music live while you speak.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "The Producer" },
};

export const viewport: Viewport = {
  themeColor: "#090a0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The studio is a fixed-height app surface. Letting the browser zoom it
  // mid-session moves controls under the user's finger.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-stage font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
