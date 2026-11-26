

# SPEC.md — Technical Specification: Sui × Lofi Caro (Mainnet Ready)

## 1. Network & Deployment Configuration (Sui Mainnet)
- **Target Network:** `mainnet` (`https://sui.io`)
- **Move Edition:** `2024` (Sui CLI v1.67+)
- **Core Coin Type:** `0x2::sui::SUI` (1 SUI = `1_000_000_000` MIST)
- **Mainnet Safety Mechanisms:**
  - **ProtocolConfig Shared Object:** Stores `treasury` address, `fee_bps` (`500` = 5.00%), `min_wager` (`100_000_000` MIST = 0.1 SUI), and `is_paused` emergency flag controlled via `AdminCap`.
  - **Turn Timeout Protection (`Clock`):** Uses Sui system clock (`0x6`) with a 5-minute (`300_000` ms) per-turn deadline so funds can never be permanently locked if an opponent disconnects on Mainnet.
  - **Strict No-NFT Policy:** Zero `0x2::display`, zero NFT structs, zero souvenir objects minted.

---

## 2. Smart Contract Specification (`move/sources/caro.move`)

### 2.1 `Move.toml` (Mainnet Standard)
```toml
[package]
name = "sui_lofi_caro"
edition = "2024"

[dependencies]
# Implicitly resolved in Sui CLI v1.67+, or specify Sui Mainnet framework rev if required

[addresses]
sui_lofi_caro = "0x0"
```

### 2.2 Constants & Error Codes
```move
module sui_lofi_caro::caro;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

// Board & Game Constants
const BOARD_DIM: u8 = 15;
const BOARD_LEN: u64 = 225; // 15 * 15
const CELL_EMPTY: u8 = 0;
const CELL_SUI_X: u8 = 1;  // Player 1 (Sui Logo)
const CELL_LOFI_O: u8 = 2; // Player 2 (Lofi Logo)

// Status Constants
const STATUS_WAITING: u8 = 0;
const STATUS_IN_PROGRESS: u8 = 1;
const STATUS_FINISHED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// Economics & Timeout
const FEE_BPS: u128 = 500;          // 5% = 500 / 10,000
const BPS_DENOMINATOR: u128 = 10_000;
const DEFAULT_MIN_WAGER: u64 = 100_000_000; // 0.1 SUI
const TURN_TIMEOUT_MS: u64 = 300_000;       // 5 minutes per turn

// Error Codes
const EProtocolPaused: u64 = 1;
const EWagerTooLow: u64 = 2;
const EInvalidWagerMatch: u64 = 3;
const EInvalidGameStatus: u64 = 4;
const ESelfPlayNotAllowed: u64 = 5;
const ENotAuthorizedPlayer: u64 = 6;
const ENotYourTurn: u64 = 7;
const EOutOfBounds: u64 = 8;
const ECellOccupied: u64 = 9;
const ETimeoutNotReached: u64 = 10;
```

### 2.3 On-Chain Structs
```move
/// Capability for protocol treasury/pause management
public struct AdminCap has key, store {
    id: UID,
}

/// Shared global configuration for Mainnet safety
public struct ProtocolConfig has key {
    id: UID,
    treasury: address,
    min_wager: u64,
    is_paused: bool,
}

/// Shared object representing a single PvP Caro match
public struct GameRoom has key {
    id: UID,
    player_x: address,           // Creator (Sui X)
    player_o: Option<address>,   // Joiner (Lofi O)
    wager: u64,                  // Per-player stake in MIST
    vault: Balance<SUI>,         // Escrow holding 1x or 2x wager
    board: vector<u8>,           // Length 225: 0=Empty, 1=Sui(X), 2=Lofi(O)
    turn: u8,                    // 1 = Sui(X), 2 = Lofi(O)
    move_count: u16,             // Tracks total moves (max 225)
    status: u8,                  // 0=WAITING, 1=IN_PROGRESS, 2=FINISHED, 3=CANCELLED
    winner: Option<address>,     // None on draw/cancel
    last_move_ms: u64,           // Timestamp of join or last move
}
```

### 2.4 Events (For Real-Time Lobby & Board Sync)
```move
public struct RoomCreated has copy, drop {
    room_id: ID,
    player_x: address,
    wager: u64,
}

public struct RoomJoined has copy, drop {
    room_id: ID,
    player_x: address,
    player_o: address,
    total_pot: u64,
}

public struct MoveMade has copy, drop {
    room_id: ID,
    player: address,
    piece: u8,
    row: u8,
    col: u8,
    next_turn: u8,
}

public struct GameSettled has copy, drop {
    room_id: ID,
    winner: Option<address>, // None if Draw
    payout_winner: u64,
    protocol_fee: u64,
    reason: u8, // 1=FiveInARow, 2=Draw, 3=TimeoutWin
}

public struct RoomCancelled has copy, drop {
    room_id: ID,
    player_x: address,
    refunded: u64,
}
```

### 2.5 Entry & Public Function Signatures
1. **`fun init(ctx: &mut TxContext)`**
   - Creates `AdminCap` (transferred to deployer) and shares `ProtocolConfig` (`treasury = deployer`, `min_wager = 100_000_000`, `is_paused = false`).
2. **`public fun create_room(config: &ProtocolConfig, payment: Coin<SUI>, clock: &Clock, ctx: &mut TxContext)`**
   - Asserts `!config.is_paused` and `payment.value() >= config.min_wager`.
   - Initializes `board` with 225 zeros (`CELL_EMPTY`).
   - Locks `payment` into `vault`, shares `GameRoom`, emits `RoomCreated`.
3. **`public fun join_room(config: &ProtocolConfig, room: &mut GameRoom, payment: Coin<SUI>, clock: &Clock, ctx: &mut TxContext)`**
   - Asserts `!config.is_paused`, `room.status == STATUS_WAITING`, `ctx.sender() != room.player_x`, and `payment.value() == room.wager`.
   - Joins `payment` into `room.vault` (total pot = `2 * wager`).
   - Sets `room.player_o = option::some(ctx.sender())`, `room.status = STATUS_IN_PROGRESS`, `room.turn = CELL_SUI_X`, `room.last_move_ms = clock.timestamp_ms()`.
   - Emits `RoomJoined`.
4. **`public fun make_move(config: &ProtocolConfig, room: &mut GameRoom, row: u8, col: u8, clock: &Clock, ctx: &mut TxContext)`**
   - Validates `room.status == STATUS_IN_PROGRESS`, `row < 15 && col < 15`, sender matches `room.turn`, and `board[row * 15 + col] == CELL_EMPTY`.
   - Writes `room.turn` (`1` or `2`) into `board`, increments `move_count`, updates `last_move_ms = clock.timestamp_ms()`.
   - Checks 5-in-a-row around `(row, col)` across 4 axes (`horizontal`, `vertical`, `diag_main`, `diag_anti`):
     - **If Win:** Sets `status = STATUS_FINISHED`, `winner = option::some(sender)`. Calculates `fee = (((total_pot as u128) * 500) / 10_000) as u64`, `prize = total_pot - fee`. Transfers `prize` to `sender` and `fee` to `config.treasury`. Emits `GameSettled`.
     - **Else if `move_count == 225` (Draw):** Sets `status = STATUS_FINISHED`, `winner = option::none()`. Splits `vault` 50/50 (`wager` each) back to `player_x` and `player_o` with `0` fee. Emits `GameSettled`.
     - **Else:** Flips `room.turn` (`1 <-> 2`) and emits `MoveMade`.
5. **`public fun cancel_room(room: &mut GameRoom, ctx: &mut TxContext)`**
   - Validates `room.status == STATUS_WAITING` and `ctx.sender() == room.player_x`.
   - Sets `room.status = STATUS_CANCELLED` and transfers full `vault` back to `player_x`. Emits `RoomCancelled`.
6. **`public fun claim_timeout_win(config: &ProtocolConfig, room: &mut GameRoom, clock: &Clock, ctx: &mut TxContext)`**
   - Validates `room.status == STATUS_IN_PROGRESS` and `clock.timestamp_ms() >= room.last_move_ms + TURN_TIMEOUT_MS`.
   - Allows the waiting player (whose turn it is **not**) to claim victory by timeout, triggering the exact same 95% winner / 5% treasury split.
7. **Admin Functions (`AdminCap` required):**
   - `public fun update_treasury(_: &AdminCap, config: &mut ProtocolConfig, new_treasury: address)`
   - `public fun set_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool)`
   - `public fun set_min_wager(_: &AdminCap, config: &mut ProtocolConfig, min_wager: u64)`

---

## 3. Frontend Architecture (Sui Stack v2 + Lofi UI)

### 3.1 Package Dependencies (`frontend/package.json`)
```json
{
  "dependencies": {
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@mysten/sui": "^2.0.0",
    "@mysten/dapp-kit-react": "^1.0.0",
    "@mysten/dapp-kit-core": "^1.0.0",
    "@mysten/slush-wallet": "^1.0.0",
    "@tanstack/react-query": "^5.66.0",
    "lucide-react": "^0.475.0"
  }
}
```

### 3.2 Component Hierarchy & Responsibilities
- **`src/providers/SuiProviders.tsx`**:
  - Configures `QueryClientProvider`, `DAppKitProvider` set to `mainnet`, and calls `registerSlushWallet("Sui × Lofi Caro")`.
- **`src/components/Navbar.tsx`**:
  - Lofi Yeti icy glass header (`bg-[#0B192C]/80 backdrop-blur-md border-b border-sky-400/30`).
  - Displays live Mainnet SUI balance, network badge (`MAINNET`), and `ConnectButton`.
- **`src/components/Lobby.tsx`**:
  - Queries `RoomCreated` events via Sui client and filters active `GameRoom` shared objects (`status === 0` or `status === 1`).
  - **CreateRoomModal:** Preset quick-stake buttons (`0.1 SUI`, `0.5 SUI`, `1 SUI`, `5 SUI`) + custom input, showing transparent fee breakdown (`Winner gets 95% | Treasury fee 5%`).
- **`src/components/CaroBoard.tsx`**:
  - Renders the 15×15 grid (`225` interactive ice tiles).
  - **Piece Rendering:**
    - `cell === 1`: Renders `<SuiPieceIcon />` (Sui droplet SVG with cyan/blue glow).
    - `cell === 2`: Renders `<LofiPieceIcon />` (Lofi Yeti head SVG with icy white/blue outline).
  - Highlights the last placed coordinate and winning 5-piece line.
  - Polls `client.getObject({ id: roomId, options: { showContent: true } })` every `1500ms` during `IN_PROGRESS` state for snappy Mainnet responsiveness.
- **`src/components/TurnTimerAndSettlement.tsx`**:
  - Countdown bar (`05:00` -> `00:00`) calculated from `room.last_move_ms`. Enables **"Claim Timeout Win"** button if opponent stalls past 5 minutes.
  - **Victory/Draw Modal:** Displays winner piece (Sui X or Lofi O), exact SUI payout (`0.95 * pot`), 5% vault fee summary, and direct link to `https://suiscan.xyz<digest>`.
