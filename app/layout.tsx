import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "DYNASTY COMMAND",
  description:
    "Institutional-grade, game-theoretic Sleeper dynasty platform: MDI arbitrage, Weibull aging curves, pick liquidity, and win-win trade matchmaking.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
