"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import CreateRoomModal from "./CreateRoomModal";
import { fetchRoom, listRooms, mistToSui, shortAddress, type GameRoomFields } from "@/lib/sui";
import { isConfigured } from "@/constants/config";

const STATUS_LABEL: Record<number, string> = {
  0: "WAITING",
  1: "IN PROGRESS",
  2: "FINISHED",
  3: "CANCELLED",
};

export default function Lobby({
  onOpenRoom,
  onCreate,
  isPending,
  onPractice,
}: {
  onOpenRoom: (roomId: string) => void;
  onCreate: (wagerSui: number) => void;
  isPending: boolean;
  onPractice: () => void;
}) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [rooms, setRooms] = useState<GameRoomFields[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState("");

  const refresh = async () => {
    if (!isConfigured) return;
    setLoading(true);
    try {
      const ids = await listRooms(client);
      const fetched = (await Promise.all(ids.map((id) => fetchRoom(client, id)))).filter(
        (r): r is GameRoomFields => r !== null && (r.status === 0 || r.status === 1),
      );
      setRooms(fetched);
    } catch {
      // Lobby stays usable; a failed refresh just shows the last list.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Five in a row. <span className="text-sky-400">Winner takes 95%.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            On-chain Gomoku PvP on Sui. Create a room, stake SUI, and outplay your opponent on a 15×15
            board. Every move, win check and payout runs in the Move contract — no server, no trust.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPractice}
            className="rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-4 py-2.5 text-sm font-bold text-cyan-200 hover:bg-cyan-400/20"
          >
            Practice board (free)
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!account || !isConfigured}
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400 disabled:opacity-50"
          >
            + Create room
          </button>
        </div>
      </div>

      {!account && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Connect your wallet (Slush or any Sui wallet) to create or join a staked room. The practice board
          works without a wallet.
        </p>
      )}
      {account && !isConfigured && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          The contract is not deployed yet — set <code className="font-mono">NEXT_PUBLIC_PACKAGE_ID</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_CONFIG_ID</code> in <code className="font-mono">.env.local</code>{" "}
          after <code className="font-mono">sui client publish</code>. The practice board still works.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value.trim())}
          placeholder="Open a room by ID (0x…)"
          className="min-w-64 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
        />
        <button
          onClick={() => roomIdInput && onOpenRoom(roomIdInput)}
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-100 hover:bg-white/5"
        >
          Open room
        </button>
        <button
          onClick={refresh}
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-100 hover:bg-white/5"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <div key={room.id} className="glass rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider ${
                  room.status === 0
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-sky-400/15 text-sky-300"
                }`}
              >
                {STATUS_LABEL[room.status]}
              </span>
              <span className="font-mono text-xs text-slate-400">{shortAddress(room.id)}</span>
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>Creator (Sui X)</span>
                <span className="font-mono">{shortAddress(room.player_x)}</span>
              </div>
              <div className="flex justify-between">
                <span>Joiner (Lofi O)</span>
                <span className="font-mono">{room.player_o ? shortAddress(room.player_o) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Wager</span>
                <span className="font-bold text-white">{mistToSui(room.wager).toFixed(2)} SUI</span>
              </div>
              <div className="flex justify-between">
                <span>Pot</span>
                <span className="font-bold text-cyan-300">{mistToSui(room.vault).toFixed(2)} SUI</span>
              </div>
              <div className="flex justify-between">
                <span>Moves</span>
                <span>{room.move_count} / 225</span>
              </div>
            </div>
            <button
              onClick={() => onOpenRoom(room.id)}
              className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400"
            >
              {room.status === 0 && account?.address !== room.player_x ? "Join & stake" : "View board"}
            </button>
          </div>
        ))}
        {rooms.length === 0 && (
          <div className="glass col-span-full rounded-3xl p-6 text-center text-sm text-slate-300">
            {isConfigured
              ? "No open rooms right now — create the first one."
              : "Lobby needs a deployed contract. Try the practice board meanwhile."}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          isPending={isPending}
          onCreate={(w) => {
            onCreate(w);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
