"use client";

import { useEffect, useState } from "react";
import { EXPLORER_TX, TURN_TIMEOUT_MS } from "@/constants/config";
import { mistToSui } from "@/lib/sui";
import SuiPieceIcon from "./SuiPieceIcon";
import LofiPieceIcon from "./LofiPieceIcon";

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function TurnTimerAndSettlement({
  status,
  turn,
  myPiece,
  lastMoveMs,
  winner,
  wagerMist,
  txDigest,
  onClaim,
  claimPending,
}: {
  status: number;
  turn: number;
  myPiece: number | null;
  lastMoveMs: number;
  winner: string | null;
  wagerMist: number;
  txDigest: string | null;
  onClaim: () => void;
  claimPending: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = lastMoveMs + TURN_TIMEOUT_MS - now;
  const canClaim =
    status === 1 && myPiece !== null && myPiece !== turn && remaining <= 0;
  const finished = status === 2;
  const pot = wagerMist * 2;

  return (
    <div className="glass mt-4 rounded-3xl p-5">
      {!finished && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-white">
              {turn === 1 ? "Sui (X) to move" : "Lofi (O) to move"}
            </span>
            <span className={`font-mono font-bold ${remaining <= 60_000 ? "text-amber-300" : "text-cyan-300"}`}>
              {fmt(remaining)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-1000"
              style={{ width: `${Math.max(0, Math.min(100, (remaining / TURN_TIMEOUT_MS) * 100))}%` }}
            />
          </div>
          {canClaim && (
            <button
              onClick={onClaim}
              disabled={claimPending}
              className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-400 disabled:opacity-50"
            >
              {claimPending ? "Claiming…" : "Claim timeout win (opponent stalled 5 min)"}
            </button>
          )}
          {status === 1 && myPiece !== null && myPiece === turn && (
            <p className="mt-3 text-xs text-slate-400">Your turn — tap an empty tile to place your piece.</p>
          )}
        </div>
      )}

      {finished && (
        <div className="text-center">
          {winner ? (
            <>
              <p className="text-xl font-bold text-white">Winner</p>
              <div className="mt-3 flex items-center justify-center gap-3">
                {/* On a win the room's turn still holds the winner's piece. */}
                {turn === 1 ? <SuiPieceIcon size={44} /> : <LofiPieceIcon size={44} />}
              </div>
              <p className="mt-3 font-mono text-sm text-slate-300">
                Winner takes <span className="font-bold text-cyan-300">{mistToSui(Math.floor(pot * 0.95)).toFixed(2)} SUI</span>
                {" · "}Protocol fee <span className="text-white">{mistToSui(Math.floor(pot * 0.05)).toFixed(2)} SUI</span>
              </p>
            </>
          ) : (
            <p className="text-xl font-bold text-white">Draw — both wagers refunded in full (0% fee).</p>
          )}
          {txDigest && (
            <a
              href={EXPLORER_TX(txDigest)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-xl border border-cyan-400/50 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/10"
            >
              View settlement on Suiscan ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
