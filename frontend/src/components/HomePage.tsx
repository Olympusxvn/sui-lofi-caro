"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import Navbar from "@/components/Navbar";
import Lobby from "@/components/Lobby";
import CaroBoard from "@/components/CaroBoard";
import TurnTimerAndSettlement from "@/components/TurnTimerAndSettlement";
import {
  buildCancelRoomTx,
  buildClaimTimeoutTx,
  buildCreateRoomTx,
  buildJoinRoomTx,
  buildMakeMoveTx,
  fetchRoom,
  findWinningLine,
  listRooms,
  mistToSui,
  shortAddress,
  suiToMist,
  type GameRoomFields,
} from "@/lib/sui";
import { EXPLORER_OBJECT, isConfigured } from "@/constants/config";

type View =
  | { kind: "lobby" }
  | { kind: "room"; roomId: string }
  | { kind: "practice" };

const EMPTY_BOARD = () => Array<number>(225).fill(0);

export default function HomePage() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const [isPending, setIsPending] = useState(false);

  const [view, setView] = useState<View>({ kind: "lobby" });
  const [room, setRoom] = useState<GameRoomFields | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  // Practice board (off-chain, no wallet needed).
  const [practiceBoard, setPracticeBoard] = useState<number[]>(EMPTY_BOARD());
  const [practiceTurn, setPracticeTurn] = useState(1);
  const [practiceWin, setPracticeWin] = useState<number[] | null>(null);
  const [practiceMoves, setPracticeMoves] = useState(0);

  const roomId = view.kind === "room" ? view.roomId : null;

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const r = await fetchRoom(client, roomId);
      if (r) {
        setRoom(r);
        if (r.move_count > 0) {
          // Highlight the most recent move by diffing against the previous board.
          setRoom((prev) => prev ?? r);
        }
      }
    } catch {
      // Polling failure is non-fatal; the next tick retries.
    }
  }, [client, roomId]);

  useEffect(() => {
    if (view.kind !== "room") return;
    refreshRoom();
    const t = setInterval(refreshRoom, 1500);
    return () => clearInterval(t);
  }, [view.kind, refreshRoom]);

  useEffect(() => {
    if (!room || room.move_count === 0) {
      setLastMove(null);
      setWinningLine(null);
      return;
    }
    // Find the last placed piece: the board cell that differs from a fresh
    // scan is expensive; instead derive the winning line from any 5-in-a-row.
    const board = room.board;
    let line: number[] | null = null;
    outer: for (let i = 0; i < 225; i++) {
      if (board[i] === 0) continue;
      const l = findWinningLine(board, Math.floor(i / 15), i % 15);
      if (l) {
        line = l;
        break outer;
      }
    }
    setWinningLine(line);
  }, [room]);

  const myPiece =
    room && account
      ? account.address === room.player_x
        ? 1
        : account.address === room.player_o
          ? 2
          : null
      : null;

  const runTx = (tx: ReturnType<typeof buildCreateRoomTx>, onSuccess?: (digest: string) => void) => {
    setNotice(null);
    setIsPending(true);
    dAppKit
      .signAndExecuteTransaction({ transaction: tx })
      .then((res) => {
        // SDK 2.39 returns a discriminated union, not a flat { digest }.
        if (res.$kind !== "Transaction") {
          throw new Error("Transaction executed but failed on-chain.");
        }
        const digest = res.Transaction.digest;
        setLastDigest(digest);
        onSuccess?.(digest);
      })
      .catch((e: Error) => setNotice(e.message || "Transaction failed."))
      .finally(() => setIsPending(false));
  };

  const handleCreate = (wagerSui: number) => {
    runTx(buildCreateRoomTx(suiToMist(wagerSui)), () => {
      // The SDK 2.39 core API no longer exposes objectChanges, so find the
      // new room by re-listing: newest WAITING room created by this account.
      listRooms(client)
        .then(async (ids) => {
          const rooms = (await Promise.all(ids.map((id) => fetchRoom(client, id)))).filter(
            (r): r is GameRoomFields => r !== null,
          );
          const mine = rooms.find(
            (r) => r.status === 0 && account?.address === r.player_x,
          );
          if (mine) setView({ kind: "room", roomId: mine.id });
          else setNotice("Room created — open it from the lobby list.");
        })
        .catch(() => setNotice("Room created — open it from the lobby list."));
    });
  };

  const handleJoin = () => {
    if (!room) return;
    runTx(buildJoinRoomTx(room.id, room.wager));
  };

  const handleMove = (row: number, col: number) => {
    if (!room || !account) return;
    if (room.status !== 1 || myPiece === null || myPiece !== room.turn) return;
    setLastMove(row * 15 + col);
    runTx(buildMakeMoveTx(room.id, row, col));
  };

  const handlePracticeMove = (row: number, col: number) => {
    const idx = row * 15 + col;
    if (practiceBoard[idx] !== 0 || practiceWin) return;
    const next = [...practiceBoard];
    next[idx] = practiceTurn;
    setPracticeBoard(next);
    setPracticeMoves((m) => m + 1);
    const line = findWinningLine(next, row, col);
    if (line) setPracticeWin(line);
    else setPracticeTurn(practiceTurn === 1 ? 2 : 1);
  };

  return (
    <div className="min-h-screen bg-[#0B192C] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.18),transparent_55%)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {notice && (
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {notice}
          </div>
        )}

        {view.kind === "lobby" && (
          <Lobby
            onOpenRoom={(id) => setView({ kind: "room", roomId: id })}
            onCreate={handleCreate}
            isPending={isPending}
            onPractice={() => setView({ kind: "practice" })}
          />
        )}

        {view.kind === "practice" && (
          <div>
            <button
              onClick={() => setView({ kind: "lobby" })}
              className="text-sm font-bold text-cyan-300 hover:text-cyan-200"
            >
              ← Back to lobby
            </button>
            <h1 className="font-display mt-3 text-3xl font-bold text-white">Practice board</h1>
            <p className="mt-1 text-sm text-slate-300">
              Off-chain hotseat practice — no wallet, no stake. Sui (X) moves first. First to five in a row
              wins.
            </p>
            <div className="mt-6">
              <CaroBoard
                board={practiceBoard}
                disabled={practiceWin !== null}
                onCell={handlePracticeMove}
                lastMove={null}
                winningLine={practiceWin}
              />
            </div>
            <div className="glass mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
              <span className="text-sm text-slate-200">
                {practiceWin
                  ? practiceTurn === 1
                    ? "Sui (X) wins the practice game!"
                    : "Lofi (O) wins the practice game!"
                  : `${practiceTurn === 1 ? "Sui (X)" : "Lofi (O)"} to move · ${practiceMoves} moves played`}
              </span>
              <button
                onClick={() => {
                  setPracticeBoard(EMPTY_BOARD());
                  setPracticeTurn(1);
                  setPracticeWin(null);
                  setPracticeMoves(0);
                }}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-400"
              >
                New practice game
              </button>
            </div>
          </div>
        )}

        {view.kind === "room" && (
          <div>
            <button
              onClick={() => {
                setView({ kind: "lobby" });
                setRoom(null);
              }}
              className="text-sm font-bold text-cyan-300 hover:text-cyan-200"
            >
              ← Back to lobby
            </button>
            {!room ? (
              <p className="mt-6 text-sm text-slate-300">Loading room…</p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
                      Room <span className="font-mono text-sky-400">{shortAddress(room.id)}</span>
                    </h1>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      <a
                        href={EXPLORER_OBJECT(room.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-300 hover:underline"
                      >
                        View room object on Suiscan ↗
                      </a>
                    </p>
                  </div>
                  <div className="glass rounded-2xl px-4 py-2 text-center">
                    <div className="text-[11px] font-bold tracking-wider text-slate-400">POT</div>
                    <div className="font-mono text-lg font-bold text-white">
                      {mistToSui(room.vault).toFixed(2)} SUI
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Winner {mistToSui(Math.floor(room.vault * 0.95)).toFixed(2)} · Fee{" "}
                      {mistToSui(Math.floor(room.vault * 0.05)).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
                    Sui (X): <span className="font-mono">{shortAddress(room.player_x)}</span>
                    {myPiece === 1 && " · you"}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
                    Lofi (O):{" "}
                    <span className="font-mono">{room.player_o ? shortAddress(room.player_o) : "waiting…"}</span>
                    {myPiece === 2 && " · you"}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
                    Moves: {room.move_count} / 225
                  </span>
                </div>

                {room.status === 0 && account?.address === room.player_x && (
                  <button
                    onClick={() => runTx(buildCancelRoomTx(room.id))}
                    disabled={isPending}
                    className="mt-4 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-400/20 disabled:opacity-50"
                  >
                    Cancel room & refund 100%
                  </button>
                )}
                {room.status === 0 && account && account.address !== room.player_x && (
                  <button
                    onClick={handleJoin}
                    disabled={isPending || !isConfigured}
                    className="mt-4 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400 disabled:opacity-50"
                  >
                    {isPending ? "Signing…" : `Join & stake ${mistToSui(room.wager).toFixed(2)} SUI`}
                  </button>
                )}

                <div className="mt-6">
                  <CaroBoard
                    board={room.board}
                    disabled={
                      isPending || room.status !== 1 || myPiece === null || myPiece !== room.turn
                    }
                    onCell={handleMove}
                    lastMove={lastMove}
                    winningLine={winningLine}
                  />
                </div>

                <TurnTimerAndSettlement
                  status={room.status}
                  turn={room.turn}
                  myPiece={myPiece}
                  lastMoveMs={room.last_move_ms}
                  winner={room.winner}
                  wagerMist={room.wager}
                  txDigest={lastDigest}
                  onClaim={() => runTx(buildClaimTimeoutTx(room.id))}
                  claimPending={isPending}
                />
              </>
            )}
          </div>
        )}

        <footer className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          <p>
            Sui × Lofi Caro · Built for the CLAY Hackathon (Code Like a Yeti) · Sui × Lofi the Yeti
          </p>
          <p className="mt-1">
            No NFTs, no custom tokens — only native SUI. Draws refund 100%, winners take 95%, 5% protocol fee.
          </p>
        </footer>
      </main>
    </div>
  );
}
