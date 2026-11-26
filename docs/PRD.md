# PRD.md — Product Requirements Document: Sui × Lofi Caro

## 1. Product Vision & Brand Direction
**Sui × Lofi Caro** is an on-chain PvP Gomoku (Five-in-a-Row) wagering game built on Sui for the CLAY Hackathon. 

### Visual & UI Aesthetic (Inspired by `lofitheyeti.com`)
The user interface must mirror the visual identity of **Lofi the Yeti** (`https://lofitheyeti.com/`):
- **Theme & Atmosphere:** Crisp Himalayan ice, glacier blue gradients, snowy white cards, and frosty glassmorphism (`backdrop-blur-md`) contrasted with deep midnight navy/slate typography and bold comic-style outlines.
- **Color Palette:**
  - Primary Ice Blue: `#38BDF8` / `#0EA5E9` (Sui & Glacier accents)
  - Deep Frost Navy: `#0B192C` / `#0F172A` (Backgrounds & bold borders)
  - Snow White: `#F8FAFC` / `#FFFFFF` (Card surfaces & board tiles)
  - Yeti Cyan Glow: `#22D3EE` (Active turn highlights & hover states)
- **Typography:** Bold, rounded, playful display headings (e.g., *Fredoka*, *Plus Jakarta Sans*, or *Space Grotesk*) paired with clean monospace (`JetBrains Mono`) for wallet addresses, wager amounts, and transaction digests.
- **Game Pieces:**
  - **Player 1 (X):** Custom **Sui Droplet Logo** (rendered in electric Sui blue).
  - **Player 2 (O):** Custom **Lofi Yeti Head Logo** (rendered with Lofi's signature icy blue & white Yeti vector).

---

## 2. Latest Sui Stack Architecture (2026 Standards)
Muse AI must strictly generate code using the modern Sui TypeScript SDK v2.0+ and Move 2024 standards (avoiding deprecated `@mysten/dapp-kit` legacy JSON-RPC patterns):
- **Smart Contract:** Sui Move (`edition = "2024"` in `Move.toml`), utilizing `public struct`, method syntax, and `Coin<SUI>` / `Balance<SUI>` escrow vaults.
- **Frontend SDK & Wallet Kit:**
  - `@mysten/sui` (v2.0+ gRPC / modern client architecture).
  - `@mysten/dapp-kit-react` & `@mysten/dapp-kit-core` (replacing legacy `@mysten/dapp-kit`).
  - `@mysten/slush-wallet` (`registerSlushWallet`) for native Slush Wallet browser extension and web app support alongside standard Sui wallets.
- **Framework:** Next.js 15+ (App Router), React 19, Tailwind CSS v4, `@tanstack/react-query`.

---

## 3. User Personas & User Flows

### Persona
- **Sui & Lofi Community Degens / Gamers:** Users holding SUI who want fast, transparent, skill-based 1v1 PvP matches with real SUI stakes and zero NFT clutter.

### Core User Flows
1. **Wallet Connection (Slush & Sui Wallets):**
   - User clicks **"Connect Wallet"** in the Lofi-styled navbar.
   - Modal prioritizes **Slush Wallet** and standard Sui wallets, displaying user's SUI balance and truncated address.
2. **Lobby & Matchmaking:**
   - **Browse Open Rooms:** View a frosty card grid of waiting rooms showing Creator address, Wager amount (in `SUI`), and a **"Join & Stake"** button.
   - **Create Room:** User inputs desired wager amount (e.g., `0.1 SUI`, `1 SUI`, `5 SUI`), signs a transaction locking their `Coin<SUI>` into a new shared `GameRoom` object, and becomes **Player 1 (Sui X)**.
3. **Active Gameplay (15×15 Grid):**
   - **Join Room:** Player 2 clicks **"Join & Stake"**, deposits the exact matching wager into the `GameRoom` vault, and becomes **Player 2 (Lofi O)**. Match status transitions from `WAITING` to `IN_PROGRESS`.
   - **Turn Execution:** Players alternate placing pieces on empty intersections/cells `(row, col)` of the 15×15 ice-themed board.
   - **Real-Time Sync:** Frontend polls or subscribes to `GameRoom` object updates so the opponent's Sui (X) or Lofi (O) piece appears immediately with an ice-shatter animation.
4. **Settlement & Vault Payout (95% / 5% Split):**
   - When a move creates 5 consecutive matching pieces (horizontal, vertical, or diagonal), the Move contract immediately marks the game `FINISHED`.
   - **Automatic Distribution:**
     - **95%** of the total vault (`2 * wager * 0.95`) is transferred directly to the winner's address.
     - **5%** protocol fee (`2 * wager * 0.05`) is transferred to the configured `treasury` address.
   - Victory modal displays the winning line, SUI won, and a link to Sui Explorer (Suiscan / SuiVision).
5. **Draw & Room Cancellation:**
   - **Cancel Waiting Room:** If no Player 2 has joined yet, Player 1 can cancel the room and reclaim 100% of their deposited SUI.
   - **Board Full (Draw):** If all 225 cells are filled without a winner, the contract refunds 100% of each player's initial wager (0% fee).

---

## 4. Functional Requirements

| ID | Feature | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-01** | **Wallet Integration** | P0 | Connects via `@mysten/dapp-kit-react` with Slush Wallet support; displays live SUI balance. |
| **FR-02** | **Room Creation & Escrow** | P0 | Creates shared `GameRoom` on-chain; locks exact `Coin<SUI>` wager (`wager > 0`). |
| **FR-03** | **Room Joining** | P0 | Validates `payment == room.wager` and `joiner != creator`; locks Player 2 SUI into vault. |
| **FR-04** | **15×15 Move Execution** | P0 | Enforces turn order (X starts first), bounds (`0..14`), and empty cell check on-chain. |
| **FR-05** | **Win Detection & Payout** | P0 | Detects 5-in-a-row on-chain; atomically splits vault 95% to winner and 5% to treasury. |
| **FR-06** | **No NFTs / Tokens** | P0 | Strictly zero NFT minting, trophy objects, or custom coin minting in contract or UI. |
| **FR-07** | **Lofi Visual Theme** | P1 | Ice-platform background aesthetic, Yeti-inspired cards, Sui SVG for X, Lofi SVG for O. |
| **FR-08** | **Cancel / Timeout Refund** | P1 | Creator can cancel `WAITING` room for 100% refund; inactive opponent timeout (optional) allows claim. |

---

## 5. Non-Functional & Hackathon Requirements
- **Gas Efficiency:** Board state stored compactly as `vector<u8>` (length 225: `0` = empty, `1` = Sui X, `2` = Lofi O) to keep gas fees minimal per move.
- **Security:** Prevent double-spending, self-play exploits (optional toggle, disabled by default in production), and integer overflow during the 5% fee calculation (`u128` intermediate math).
- **CLAY Hackathon Readiness:** Include a dedicated footer/header badge for *CLAY Hackathon (Code Like a Yeti)* and clean setup instructions in `README.md`.
