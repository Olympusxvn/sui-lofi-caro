# RULE.md — Game Rules, Financial Logic & AI Coding Guardrails

## 1. Strict AI Coding Guardrails (MANDATORY FOR MUSE AI)
When generating or modifying any code in this repository, you **MUST** obey these non-negotiable rules:

1. **NO NFTs, NO TOKENS, NO BADGES:**
   - Strictly forbid creating any NFT structs, `0x2::display` publishers, trophy collectibles, Soulbound Tokens, or custom `Coin` types.
   - Only native `0x2::sui::SUI` is used for wagering and fee settlement.
2. **USE MODERN SUI STACK ONLY (2026 STANDARDS):**
   - **Move:** Use `edition = "2024"` syntax (`public struct`, dot-method syntax like `payment.value()`, `coin::from_balance`, `transfer::public_transfer`). Do NOT use deprecated Move 2020 `struct` without `public` visibility.
   - **Frontend SDK:** Use `@mysten/sui` (v2.0+), `@mysten/dapp-kit-react`, `@mysten/dapp-kit-core`, and `@mysten/slush-wallet`. Do NOT import from deprecated `@mysten/dapp-kit` or `@mysten/sui.js`.
3. **MAINNET TARGET BY DEFAULT:**
   - Configure RPC endpoints, explorer links (`https://suiscan.xyz...`), and wallet providers to target **Sui Mainnet** (`mainnet`).
   - Never hardcode private keys or mnemonics anywhere in the codebase. Store `PACKAGE_ID` and `CONFIG_ID` in `.env.local` (`NEXT_PUBLIC_PACKAGE_ID`, `NEXT_PUBLIC_CONFIG_ID`).
4. **EXACT PIECE VISUALS:**
   - **X (`1`)** MUST always render the **Sui Droplet Logo** (`#38BDF8` / `#0EA5E9`).
   - **O (`2`)** MUST always render the **Lofi the Yeti Logo** (icy white & glacier blue vector).
   - Never render plain text `"X"` or `"O"` characters on the game board.

---

## 2. Official Caro (Gomoku) Gameplay Rules

### 2.1 Board & Turn Order
- **Grid Dimensions:** Standard `15 × 15` grid (`225` total cells, zero-indexed `row ∈ [0..14]`, `col ∈ [0..14]`).
- **Linear Index Mapping:** `index = (row as u64) * 15 + (col as u64)`.
- **Player Roles:**
  - **Room Creator (`player_x`):** Always plays **Sui (X)** and **always makes the first move**.
  - **Room Joiner (`player_o`):** Always plays **Lofi (O)** and moves second.
- **Move Validity:**
  - A player may only place a piece during `STATUS_IN_PROGRESS` (`1`) when `room.turn` matches their assigned piece (`1` for `player_x`, `2` for `player_o`).
  - Target cell `board[index]` MUST equal `CELL_EMPTY` (`0`). Overwriting existing pieces is strictly impossible.

### 2.2 Win Condition (Standard Freestyle Five-in-a-Row)
- A player wins immediately upon placing a piece that forms an unbroken line of **5 or more** consecutive matching pieces (`>= 5`) along any of the 4 axes:
  1. **Horizontal:** `(0, -1)` and `(0, +1)`
  2. **Vertical:** `(-1, 0)` and `(+1, 0)`
  3. **Main Diagonal (`\`):** `(-1, -1)` and `(+1, +1)`
  4. **Anti-Diagonal (`/`):** `(-1, +1)` and `(+1, -1)`
- **Algorithm Requirement:** Check only from the newly placed coordinate `(row, col)` outward in both directions per axis (`count = 1 + forward_matches + backward_matches`). If `count >= 5`, trigger instant win settlement.

### 2.3 Draw Condition
- If `move_count == 225` and the 225th move does **not** achieve 5-in-a-row, the match ends in a **Draw**.

---

## 3. Vault Economics, 5% Fee Math & Settlement Rules

### 3.1 Escrow & Pot Construction
- Player 1 deposits `W` MIST (`W >= min_wager`, default `0.1 SUI = 100_000_000` MIST).
- Player 2 deposits exact matching `W` MIST (`payment.value() == room.wager`).
- **Total Vault (`total_pot`):** `2 * W` MIST.

### 3.2 Exact Fee Formula (5% Vault Fee)
- **Protocol Fee Rate:** `5%` (`500` basis points out of `10,000`).
- **Integer Math (Zero Overflow):**
  ```move
  let total_pot: u64 = room.vault.value();
  let protocol_fee: u64 = (((total_pot as u128) * 500u128) / 10_000u128) as u64;
  let winner_payout: u64 = total_pot - protocol_fee;
  ```
- **Example Calculation:**
  - Player 1 stakes `1.0 SUI`, Player 2 stakes `1.0 SUI` -> `total_pot = 2.0 SUI`.
  - `protocol_fee` = `2.0 * 0.05 = 0.10 SUI` -> Transferred immediately to `config.treasury`.
  - `winner_payout` = `2.0 - 0.10 = 1.90 SUI` -> Transferred immediately to `winner`.

### 3.3 Refunds & Timeout Enforcement
- **Pre-Match Cancellation (`STATUS_WAITING`):**
  - Only `player_x` can call `cancel_room`.
  - **Fee:** `0%`. `player_x` receives `100%` of `W` back.
- **Draw (`move_count == 225`, no winner):**
  - **Fee:** `0%`. `player_x` receives `W` back, and `player_o` receives `W` back.
- **Turn Timeout (`TURN_TIMEOUT_MS = 300_000` ms / 5 minutes):**
  - Every move updates `room.last_move_ms = clock.timestamp_ms()`.
  - If the active player fails to move within `300,000` ms, the waiting opponent can call `claim_timeout_win`.
  - Timeout wins follow the **exact same 95% / 5% vault split** (`95%` to claiming opponent, `5%` to `config.treasury`).

---

## 4. UI / UX & Code Quality Rules (Lofi Style)
- **Visual Style (`lofitheyeti.com`):**
  - Use icy glacier backgrounds (`#0B192C` deep frost base with `#38BDF8` cyan highlights and crisp white `#FFFFFF` board tiles).
  - Display clear pre-match stake math in the UI before wallet signing:
    - *"Your Stake: X SUI | Total Pot: 2X SUI | Winner Takes (95%): 1.9X SUI | Protocol Fee (5%): 0.1X SUI"*
- **Transaction Safety:**
  - Always build Programmable Transaction Blocks (PTBs) cleanly using `Transaction` from `@mysten/sui/transactions`.
  - Split exact wager coins from `tx.gas` (`const [wagerCoin] = tx.splitCoins(tx.gas, [wagerMist])`) rather than passing the entire gas coin object.
  - Disable board cell clicks while a transaction is pending (`isPending === true`) to prevent duplicate wallet popups.
- **Testing Requirement:**
  - `move/tests/caro_tests.move` MUST include unit tests covering: (1) horizontal/vertical/diagonal wins + exact 95%/5% balance assertions, (2) draw 50/50 refund, (3) room cancellation, (4) timeout win claim, and (5) failure on wrong turn / wrong wager / occupied cell.
