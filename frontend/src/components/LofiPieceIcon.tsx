/// Player 2 (O) — Lofi the Yeti head logo. Never render a plain "O" (RULE.md §1.4).
import { LOFI_O_DATA_URI } from "./pieceImages";

export default function LofiPieceIcon({ size = 30 }: { size?: number }) {
  return (
    <img
      src={LOFI_O_DATA_URI}
      alt="Lofi"
      width={size}
      height={size}
      className="piece-pop drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]"
      draggable={false}
    />
  );
}
