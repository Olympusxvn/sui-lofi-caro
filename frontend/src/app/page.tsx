"use client";

import dynamic from "next/dynamic";

// The game UI uses the Sui wallet web components, which touch `window` at
// import time. Keep the whole page client-only so server prerendering never
// loads them.
const HomePage = dynamic(() => import("@/components/HomePage"), { ssr: false });

export default function Page() {
  return <HomePage />;
}
