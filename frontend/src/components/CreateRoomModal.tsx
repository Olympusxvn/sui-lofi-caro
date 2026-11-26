"use client";

import { useState } from "react";
import { MIN_WAGER_SUI } from "@/constants/config";
import { mistToSui } from "@/lib/sui";

const PRESETS = [0.1, 0.5, 1, 5];

export default function CreateRoomModal({
  onClose,
  onCreate,
  isPending,
}: {
  onClose: () => void;
  onCreate: (wagerSui: number) => void;
  isPending: boolean;
}) {
  const [wager, setWager] = useState(0.5);
  const [custom, setCustom] = useState("");

  const effective = custom ? Number(custom) : wager;
  const valid = Number.isFinite(effective) && effective >= MIN_WAGER_SUI;
  const pot = valid ? effective * 2 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass w-full max-w-md rounded-3xl bg-[#0F172A]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-bold text-white">Create a room</h2>
        <p className="mt-1 text-sm text-slate-300">
          You play <span className="font-bold text-sky-400">Sui (X)</span> and move first. Your wager is locked
          in the on-chain vault until the match settles.
        </p>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setWager(p);
                setCustom("");
              }}
              className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition ${
                wager === p && !custom
                  ? "border-cyan-400 bg-cyan-400/20 text-cyan-200"
                  : "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/50"
              }`}
            >
              {p} SUI
            </button>
          ))}
        </div>
        <input
          type="number"
          min={MIN_WAGER_SUI}
          step="0.1"
          placeholder={`Custom (min ${MIN_WAGER_SUI} SUI)`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
        />

        <div className="mt-5 space-y-1.5 rounded-2xl bg-white/5 p-4 font-mono text-sm">
          <div className="flex justify-between text-slate-300">
            <span>Your stake</span>
            <span className="text-white">{valid ? effective.toFixed(2) : "—"} SUI</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Total pot (2×)</span>
            <span className="text-white">{valid ? pot.toFixed(2) : "—"} SUI</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Winner takes (95%)</span>
            <span className="font-bold text-cyan-300">{valid ? (pot * 0.95).toFixed(2) : "—"} SUI</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Protocol fee (5%)</span>
            <span>{valid ? (pot * 0.05).toFixed(2) : "—"} SUI</span>
          </div>
        </div>

        {!valid && (
          <p className="mt-3 text-xs text-amber-300">Minimum wager is {MIN_WAGER_SUI} SUI.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={!valid || isPending}
            onClick={() => onCreate(effective)}
            className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {isPending ? "Signing…" : "Create & stake"}
          </button>
        </div>
      </div>
    </div>
  );
}
