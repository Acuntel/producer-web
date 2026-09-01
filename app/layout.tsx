import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Producer",
  description: "Talk a song into existence. A conversational AI producer that builds the music live while you speak.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
