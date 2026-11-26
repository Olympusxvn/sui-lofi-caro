/// Player 1 (X) — Sui Droplet Logo. Never render a plain "X" (RULE.md §1.4).
import { SUI_X_DATA_URI } from "./pieceImages";

export default function SuiPieceIcon({ size = 30 }: { size?: number }) {
  return (
    <img
      src={SUI_X_DATA_URI}
      alt="Sui"
      width={size}
      height={size}
      className="piece-pop drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
      draggable={false}
    />
  );
}
