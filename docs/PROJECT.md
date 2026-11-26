# PROJECT.md — Sui × Lofi Caro (On-Chain Gomoku PvP)

## 1. Project Overview
**Sui × Lofi Caro** is a decentralized, peer-to-peer (PvP) on-chain Gomoku (Five-in-a-Row) game built on the **Sui Network** for the **CLAY Hackathon (Code Like a Yeti)**. Players compete against each other in real-time by wagering native **SUI** tokens. 

The visual identity blends the Sui ecosystem with the Lofi the Yeti brand:
- **Player 1 (X):** Represented by the **Sui Logo**.
- **Player 2 (O):** Represented by the **Lofi the Yeti Logo**.

## 2. Core Mechanics & Scope
- **Pure On-Chain Gameplay:** Every board state, move validation, and win-condition check (5 consecutive pieces horizontally, vertically, or diagonally) is executed transparently via Sui Move smart contracts.
- **SUI Wagering & Vault Economics:**
  - Players create or join a match room by depositing an exact wager amount in `SUI`.
  - Both players' wagers are locked inside a match-specific on-chain `Balance<SUI>` vault.
  - **Fee Structure:** Upon match completion, a **5% protocol fee** is deducted from the total vault (combined pot) and transferred to the protocol treasury address. The remaining **95%** is automatically transferred to the winner.
  - **Draw / Cancellation:** If a match ends in a draw (full board with no winner), each player is refunded 100% of their initial wager (0% fee on draws), or subject to timeout rules defined in `RULE.md`.
- **Explicit Exclusion (No NFTs):** This project focuses purely on lightweight state execution and DeFi wagering mechanics. **Do NOT implement any NFT minting, badge creation, or Soulbound Token (SBT) logic.**

## 3. Target Tech Stack
- **Smart Contract:** Sui Move (Edition 2024.beta), Sui CLI v1.67+.
- **Frontend Framework:** Next.js (App Router) / React with TypeScript.
- **Styling:** Tailwind CSS (Responsive, clean Yeti/Ice & Sui Blue aesthetic).
- **Web3 Integration:** `@mysten/dapp-kit`, `@mysten/sui` (TypeScript SDK), `@tanstack/react-query`.
- **Optional Storage (Hackathon Bonus):** Walrus decentralized storage for archiving completed match JSON replays off-chain to minimize on-chain bloat.

## 4. Repository Structure
```text
sui-lofi-caro/
├── docs/
│   ├── PROJECT.md       # High-level project vision & architecture (this file)
│   ├── PRD.md           # Product Requirements Document & user flows
│   ├── SPEC.md          # Technical specifications, Move structs & function signatures
│   └── RULE.md          # Game rules, board constraints, fee math & AI coding guardrails
├── move/                # Sui Move smart contract package
│   ├── Move.toml
│   ├── sources/
│   │   └── caro.move    # Core game logic, escrow vault, and 5% fee distribution
│   └── tests/
│       └── caro_tests.move
└── frontend/            # Next.js web application
    ├── public/
    │   └── assets/
    │       ├── sui-x.svg    # Custom Sui logo asset for X
    │       └── lofi-o.svg   # Custom Lofi logo asset for O
    └── src/
        ├── app/
        ├── components/      # Board, Cell, Lobby, WalletConnect, WagerModal
        ├── hooks/           # Sui RPC queries, transaction builders
        └── constants/       # Package ID, Treasury Address, Network config
```

## 5. Development Milestones
1. **Documentation & Guardrails:** Finalize `PROJECT.md`, `PRD.md`, `SPEC.md`, and `RULE.md`.
2. **Smart Contract (`caro.move`):** Implement room creation, joining with SUI escrow, 15x15 grid state, 5-in-a-row win detection, and 95%/5% vault payout. Write comprehensive unit tests.
3. **Testnet Deployment:** Deploy package to Sui Testnet and record `PACKAGE_ID` and `TREASURY_CAP`/`ADMIN_CONFIG`.
4. **Frontend Integration:** Build the lobby, interactive 15x15 board rendering custom Sui (X) and Lofi (O) SVG pieces, and transaction signing flows.
5. **Submission Prep:** Record 3–5 minute demo video, prepare 1:1 logo, and push clean repository to GitHub.
