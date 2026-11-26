"use client";

import { useEffect, useState } from "react";
import { ConnectButton, useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { SUI_NETWORK } from "@/constants/config";
import { mistToSui, shortAddress } from "@/lib/sui";
import { LOFI_O_DATA_URI } from "./pieceImages";

export default function Navbar() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!account?.address) {
      setBalance(null);
      return;
    }
    let alive = true;
    client.core
      .getBalance({ owner: account.address })
      .then((b) => {
        if (alive) setBalance(b.balance.balance);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account?.address, client]);

  return (
    <header className="sticky top-0 z-40 border-b border-sky-400/30 bg-[#0B192C]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="flex items-center gap-3">
          <img src={LOFI_O_DATA_URI} alt="Lofi" width={40} height={40} className="float-slow" />
          <span className="leading-tight">
            <span className="font-display block text-lg font-bold tracking-wide text-white">
              Sui <span className="text-sky-400">×</span> Lofi Caro
            </span>
            <span className="text-[11px] font-medium tracking-widest text-cyan-300/80">
              ON-CHAIN GOMOKU PVP · CLAY HACKATHON
            </span>
          </span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-bold tracking-wider text-sky-300 sm:inline-block">
            {SUI_NETWORK.toUpperCase()}
          </span>
          {account && balance !== null && (
            <span className="hidden rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white sm:inline-block">
              {mistToSui(Number(balance)).toFixed(4)} SUI · {shortAddress(account.address)}
            </span>
          )}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
