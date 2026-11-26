"use client";

import { useEffect, useState } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { SUI_NETWORK } from "@/constants/config";

// dapp-kit v1 API (2026): one DAppKit instance created with createDAppKit,
// served to the tree by DAppKitProvider. Slush Wallet is enabled via the
// built-in slushWalletConfig option — no separate registerSlushWallet call.
//
// The kit touches window/localStorage, so it is created in useEffect (client
// only); server prerendering renders a blank frost screen instead.
const FULLNODE_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
} as const;

function createKit() {
  return createDAppKit({
    networks: ["mainnet", "testnet"],
    defaultNetwork: SUI_NETWORK,
    // NOTE: SuiJsonRpcClient is deprecated in SDK 2.39 in favour of the
    // gRPC client, but it is still served by the fullnodes and keeps the
    // stable getObject / listEvents / getTransaction API this app uses.
    createClient: (network) =>
      new SuiJsonRpcClient({ url: FULLNODE_URLS[network], network }),
    slushWalletConfig: { appName: "Sui × Lofi Caro" },
  });
}

export default function SuiProviders({ children }: { children: React.ReactNode }) {
  const [kit, setKit] = useState<ReturnType<typeof createKit> | null>(null);

  useEffect(() => {
    setKit(createKit());
  }, []);

  if (!kit) return <div className="min-h-screen bg-[#0B192C]" />;
  return <DAppKitProvider dAppKit={kit}>{children}</DAppKitProvider>;
}
