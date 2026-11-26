"use client";

import SuiPieceIcon from "./SuiPieceIcon";
import LofiPieceIcon from "./LofiPieceIcon";

export default function CaroBoard({
  board,
  disabled,
  onCell,
  lastMove,
  winningLine,
}: {
  board: number[];
  disabled: boolean;
  onCell: (row: number, col: number) => void;
  lastMove: number | null;
  winningLine: number[] | null;
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className="mx-auto grid w-fit gap-[2px] rounded-2xl border-2 border-sky-400/40 bg-[#0F172A] p-2 shadow-[0_0_40px_rgba(56,189,248,0.25)]"
        style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
      >
        {board.map((cell, idx) => {
          const row = Math.floor(idx / 15);
          const col = idx % 15;
          const isLast = lastMove === idx;
          const isWin = winningLine?.includes(idx) ?? false;
          return (
            <button
              key={idx}
              disabled={disabled || cell !== 0}
              onClick={() => onCell(row, col)}
              aria-label={`Row ${row + 1}, column ${col + 1}`}
              className={`board-tile flex h-7 w-7 items-center justify-center rounded-[4px] sm:h-9 sm:w-9 ${
                isWin
                  ? "bg-cyan-400/50 ring-2 ring-cyan-300"
                  : isLast
                    ? "bg-cyan-400/25"
                    : "bg-white/[0.07]"
              }`}
            >
              {cell === 1 && <SuiPieceIcon size={24} />}
              {cell === 2 && <LofiPieceIcon size={24} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
