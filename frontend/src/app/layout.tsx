import type { Metadata } from "next";
import ClientProviders from "@/providers/ClientProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sui x Lofi Caro — On-Chain Gomoku PvP",
  description:
    "Five-in-a-row PvP on Sui. Stake SUI, winner takes 95%, 5% protocol fee. Built for the CLAY Hackathon (Code Like a Yeti).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
