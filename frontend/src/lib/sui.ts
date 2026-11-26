import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { CONFIG_ID, MODULE, PACKAGE_ID } from "@/constants/config";

/** The dapp-kit v1 client: queries go through its `.core` (CoreClient) API. */
export type SuiApiClient = ClientWithCoreApi;

export type RoomStatus = "WAITING" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

export interface GameRoomFields {
  id: string;
  player_x: string;
  player_o: string | null;
  wager: number; // MIST
  vault: number; // MIST
  board: number[];
  turn: number; // 1 = Sui (X), 2 = Lofi (O)
  move_count: number;
  status: number; // 0 waiting, 1 in progress, 2 finished, 3 cancelled
  winner: string | null;
  last_move_ms: number;
}

export const MIST_PER_SUI = 1_000_000_000;

export function suiToMist(sui: number): number {
  return Math.round(sui * MIST_PER_SUI);
}

export function mistToSui(mist: number): number {
  return mist / MIST_PER_SUI;
}

/** Split exact wager coins from gas, per RULE.md (never pass the whole gas coin). */
function splitWager(tx: Transaction, wagerMist: number) {
  const [coin] = tx.splitCoins(tx.gas, [wagerMist]);
  return coin;
}

function moveCall(tx: Transaction, fn: string, args: unknown[]) {
  return tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::${fn}`,
    arguments: args as never,
  });
}

export function buildCreateRoomTx(wagerMist: number): Transaction {
  const tx = new Transaction();
  const coin = splitWager(tx, wagerMist);
  moveCall(tx, "create_room", [tx.object(CONFIG_ID), coin, tx.object("0x6")]);
  return tx;
}

export function buildJoinRoomTx(roomId: string, wagerMist: number): Transaction {
  const tx = new Transaction();
  const coin = splitWager(tx, wagerMist);
  moveCall(tx, "join_room", [tx.object(CONFIG_ID), tx.object(roomId), coin, tx.object("0x6")]);
  return tx;
}

export function buildMakeMoveTx(roomId: string, row: number, col: number): Transaction {
  const tx = new Transaction();
  moveCall(tx, "make_move", [
    tx.object(CONFIG_ID),
    tx.object(roomId),
    tx.pure.u8(row),
    tx.pure.u8(col),
    tx.object("0x6"),
  ]);
  return tx;
}

export function buildCancelRoomTx(roomId: string): Transaction {
  const tx = new Transaction();
  moveCall(tx, "cancel_room", [tx.object(roomId)]);
  return tx;
}

export function buildClaimTimeoutTx(roomId: string): Transaction {
  const tx = new Transaction();
  moveCall(tx, "claim_timeout_win", [tx.object(CONFIG_ID), tx.object(roomId), tx.object("0x6")]);
  return tx;
}

/** Tolerant readers for the core API's Move JSON (shapes vary by transport). */
const asNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
};

const optAddr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.vec)) return o.vec.length > 0 ? String(o.vec[0]) : null;
    const fields = o.fields as Record<string, unknown> | undefined;
    if (fields && Array.isArray(fields.vec)) {
      return fields.vec.length > 0 ? String(fields.vec[0]) : null;
    }
  }
  return null;
};

const balanceVal = (v: unknown): number => {
  if (typeof v === "number" || typeof v === "string") return Number(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.value !== undefined) return asNum(o.value);
    if (o.balance !== undefined) return asNum(o.balance);
    const fields = o.fields as Record<string, unknown> | undefined;
    if (fields?.value !== undefined) return asNum(fields.value);
    if (fields?.balance !== undefined) return asNum(fields.balance);
  }
  return 0;
};

export async function fetchRoom(
  client: SuiApiClient,
  roomId: string,
): Promise<GameRoomFields | null> {
  const res = await client.core.getObject({ objectId: roomId, include: { json: true } });
  const f = res.object?.json as Record<string, unknown> | null | undefined;
  if (!f) return null;
  const boardRaw = f.board;
  const board = Array.isArray(boardRaw) ? boardRaw.map((n) => asNum(n)) : [];
  return {
    id: roomId,
    player_x: String(f.player_x ?? ""),
    player_o: optAddr(f.player_o),
    wager: asNum(f.wager),
    vault: balanceVal(f.vault),
    board,
    turn: asNum(f.turn),
    move_count: asNum(f.move_count),
    status: asNum(f.status),
    winner: optAddr(f.winner),
    last_move_ms: asNum(f.last_move_ms),
  };
}

/** List open/active rooms via RoomCreated events, newest first. */
export async function listRooms(client: SuiApiClient, limit = 30): Promise<string[]> {
  if (!PACKAGE_ID) return [];
  const res = await client.core.listEvents({
    filter: { eventType: `${PACKAGE_ID}::${MODULE}::RoomCreated` },
    limit,
    order: "descending",
  });
  const ids = res.events
    .map((e) => (e.json as { room_id?: string } | null)?.room_id)
    .filter((x): x is string => typeof x === "string");
  return [...new Set(ids)];
}

/** Check 5-in-a-row locally (for highlighting the winning line). */
export function findWinningLine(board: number[], row: number, col: number): number[] | null {
  const piece = board[row * 15 + col];
  if (!piece) return null;
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const line = [row * 15 + col];
    for (const [sr, sc] of [
      [dr, dc],
      [-dr, -dc],
    ]) {
      let r = row + sr;
      let c = col + sc;
      while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === piece) {
        line.push(r * 15 + c);
        r += sr;
        c += sc;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
