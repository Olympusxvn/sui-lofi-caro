"use client";

import dynamic from "next/dynamic";

// SuiProviders creates the dAppKit (window/localStorage) — client-only.
const SuiProviders = dynamic(() => import("./SuiProviders"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <SuiProviders>{children}</SuiProviders>;
}
