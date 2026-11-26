/// Sui x Lofi Caro — on-chain PvP Gomoku (Five-in-a-Row) with SUI wagering.
///
/// Rules (see docs/RULE.md):
/// * 15x15 board, vector<u8> length 225: 0 = empty, 1 = Sui (X), 2 = Lofi (O).
/// * Creator is X and moves first; joiner is O and moves second.
/// * Win = 5+ in a row on any of the 4 axes, checked from the last move.
/// * Settlement: 95% of the vault to the winner, 5% to the treasury.
/// * Draw (225 moves, no winner) and pre-match cancel refund 100%, 0% fee.
/// * 5-minute per-turn timeout; the waiting player can claim a timeout win.
/// * STRICT NO-NFT POLICY: only native 0x2::sui::SUI is ever used. No display,
///   no NFT structs, no custom coin types anywhere in this module.
module sui_lofi_caro::caro;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

// ---------- Board & game constants ----------
const BOARD_DIM: u8 = 15;
const BOARD_LEN: u64 = 225; // 15 * 15
const CELL_EMPTY: u8 = 0;
const CELL_SUI_X: u8 = 1; // Player 1 (Sui logo)
const CELL_LOFI_O: u8 = 2; // Player 2 (Lofi logo)

// ---------- Status constants ----------
const STATUS_WAITING: u8 = 0;
const STATUS_IN_PROGRESS: u8 = 1;
const STATUS_FINISHED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// ---------- Economics & timeout ----------
const FEE_BPS: u128 = 500; // 5% = 500 / 10_000
const BPS_DENOMINATOR: u128 = 10_000;
const DEFAULT_MIN_WAGER: u64 = 100_000_000; // 0.1 SUI
const TURN_TIMEOUT_MS: u64 = 300_000; // 5 minutes per turn

// ---------- Error codes ----------
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

// ---------- Structs ----------
/// Capability for protocol treasury / pause / min-wager management.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared global configuration. Treasury + fee + min wager + emergency pause.
public struct ProtocolConfig has key {
    id: UID,
    treasury: address,
    min_wager: u64,
    is_paused: bool,
}

/// Shared object representing a single PvP Caro match.
public struct GameRoom has key {
    id: UID,
    player_x: address,
    player_o: Option<address>,
    wager: u64, // Per-player stake in MIST
    vault: Balance<SUI>,
    board: vector<u8>, // Length 225: 0 = empty, 1 = Sui (X), 2 = Lofi (O)
    turn: u8, // 1 = Sui (X), 2 = Lofi (O)
    move_count: u16, // Total moves (max 225)
    status: u8, // 0 = WAITING, 1 = IN_PROGRESS, 2 = FINISHED, 3 = CANCELLED
    winner: Option<address>, // None on draw / cancel
    last_move_ms: u64, // Timestamp of join or last move
}

// ---------- Events ----------
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
    winner: Option<address>, // None if draw
    payout_winner: u64,
    protocol_fee: u64,
    reason: u8, // 1 = FiveInARow, 2 = Draw, 3 = TimeoutWin
}

public struct RoomCancelled has copy, drop {
    room_id: ID,
    player_x: address,
    refunded: u64,
}

// ---------- Init ----------
fun init(ctx: &mut TxContext) {
    transfer::public_transfer(
        AdminCap { id: object::new(ctx) },
        ctx.sender(),
    );
    transfer::share_object(ProtocolConfig {
        id: object::new(ctx),
        treasury: ctx.sender(),
        min_wager: DEFAULT_MIN_WAGER,
        is_paused: false,
    });
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

// ---------- Room lifecycle ----------
/// Create a room and lock the creator's wager. Creator is X and moves first.
public fun create_room(
    config: &ProtocolConfig,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!config.is_paused, EProtocolPaused);
    assert!(payment.value() >= config.min_wager, EWagerTooLow);
    let wager = payment.value();
    let mut board = vector::empty<u8>();
    let mut i = 0;
    while (i < BOARD_LEN) {
        vector::push_back(&mut board, CELL_EMPTY);
        i = i + 1;
    };
    let room = GameRoom {
        id: object::new(ctx),
        player_x: ctx.sender(),
        player_o: option::none(),
        wager,
        vault: coin::into_balance(payment),
        board,
        turn: CELL_SUI_X,
        move_count: 0,
        status: STATUS_WAITING,
        winner: option::none(),
        last_move_ms: clock.timestamp_ms(),
    };
    event::emit(RoomCreated {
        room_id: object::id(&room),
        player_x: ctx.sender(),
        wager,
    });
    transfer::share_object(room);
}

/// Join a waiting room with the exact matching wager. Joiner is O.
public fun join_room(
    config: &ProtocolConfig,
    room: &mut GameRoom,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!config.is_paused, EProtocolPaused);
    assert!(room.status == STATUS_WAITING, EInvalidGameStatus);
    assert!(ctx.sender() != room.player_x, ESelfPlayNotAllowed);
    assert!(payment.value() == room.wager, EInvalidWagerMatch);
    balance::join(&mut room.vault, coin::into_balance(payment));
    room.player_o = option::some(ctx.sender());
    room.status = STATUS_IN_PROGRESS;
    room.turn = CELL_SUI_X;
    room.last_move_ms = clock.timestamp_ms();
    event::emit(RoomJoined {
        room_id: object::id(room),
        player_x: room.player_x,
        player_o: ctx.sender(),
        total_pot: room.vault.value(),
    });
}

/// Place a piece. Enforces turn order, bounds and empty-cell on-chain.
public fun make_move(
    config: &ProtocolConfig,
    room: &mut GameRoom,
    row: u8,
    col: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!config.is_paused, EProtocolPaused);
    assert!(room.status == STATUS_IN_PROGRESS, EInvalidGameStatus);
    assert!(row < BOARD_DIM && col < BOARD_DIM, EOutOfBounds);
    let sender = ctx.sender();
    let piece = room.turn;
    if (piece == CELL_SUI_X) {
        assert!(sender == room.player_x, ENotYourTurn);
    } else {
        assert!(sender == *option::borrow(&room.player_o), ENotYourTurn);
    };
    let idx = (row as u64) * (BOARD_DIM as u64) + (col as u64);
    assert!(*vector::borrow(&room.board, idx) == CELL_EMPTY, ECellOccupied);
    *vector::borrow_mut(&mut room.board, idx) = piece;
    room.move_count = room.move_count + 1;
    room.last_move_ms = clock.timestamp_ms();

    if (is_five_in_a_row(&room.board, row, col, piece)) {
        settle_win(config, room, sender, 1, ctx);
    } else if ((room.move_count as u64) == BOARD_LEN) {
        // Draw: refund 100% of each wager, 0% fee.
        room.status = STATUS_FINISHED;
        room.winner = option::none();
        let refund_x = coin::take(&mut room.vault, room.wager, ctx);
        transfer::public_transfer(refund_x, room.player_x);
        let player_o = *option::borrow(&room.player_o);
        let remaining = room.vault.value();
        let refund_o = coin::take(&mut room.vault, remaining, ctx);
        transfer::public_transfer(refund_o, player_o);
        event::emit(GameSettled {
            room_id: object::id(room),
            winner: option::none(),
            payout_winner: 0,
            protocol_fee: 0,
            reason: 2,
        });
    } else {
        room.turn = if (piece == CELL_SUI_X) { CELL_LOFI_O } else { CELL_SUI_X };
        event::emit(MoveMade {
            room_id: object::id(room),
            player: sender,
            piece,
            row,
            col,
            next_turn: room.turn,
        });
    }
}

/// Creator cancels a still-waiting room for a 100% refund, 0% fee.
public fun cancel_room(room: &mut GameRoom, ctx: &mut TxContext) {
    assert!(room.status == STATUS_WAITING, EInvalidGameStatus);
    assert!(ctx.sender() == room.player_x, ENotAuthorizedPlayer);
    room.status = STATUS_CANCELLED;
    let refund_amount = room.vault.value();
    let refund = coin::take(&mut room.vault, refund_amount, ctx);
    transfer::public_transfer(refund, room.player_x);
    event::emit(RoomCancelled {
        room_id: object::id(room),
        player_x: room.player_x,
        refunded: room.wager,
    });
}

/// Waiting player claims a win when the opponent stalls past the timeout.
/// Same 95% winner / 5% treasury split as a board win.
public fun claim_timeout_win(
    config: &ProtocolConfig,
    room: &mut GameRoom,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!config.is_paused, EProtocolPaused);
    assert!(room.status == STATUS_IN_PROGRESS, EInvalidGameStatus);
    assert!(
        clock.timestamp_ms() >= room.last_move_ms + TURN_TIMEOUT_MS,
        ETimeoutNotReached,
    );
    let sender = ctx.sender();
    // Only the player whose turn it is NOT can claim.
    if (room.turn == CELL_SUI_X) {
        assert!(sender == *option::borrow(&room.player_o), ENotAuthorizedPlayer);
    } else {
        assert!(sender == room.player_x, ENotAuthorizedPlayer);
    };
    settle_win(config, room, sender, 3, ctx);
}

// ---------- Admin ----------
public fun update_treasury(
    _: &AdminCap,
    config: &mut ProtocolConfig,
    new_treasury: address,
) {
    config.treasury = new_treasury;
}

public fun set_paused(_: &AdminCap, config: &mut ProtocolConfig, paused: bool) {
    config.is_paused = paused;
}

public fun set_min_wager(_: &AdminCap, config: &mut ProtocolConfig, min_wager: u64) {
    config.min_wager = min_wager;
}

// ---------- Read-only views (used by the frontend and tests) ----------
public fun status(room: &GameRoom): u8 { room.status }
public fun winner(room: &GameRoom): Option<address> { room.winner }
public fun turn(room: &GameRoom): u8 { room.turn }
public fun move_count(room: &GameRoom): u16 { room.move_count }
public fun wager(room: &GameRoom): u64 { room.wager }
public fun player_x(room: &GameRoom): address { room.player_x }
public fun player_o(room: &GameRoom): Option<address> { room.player_o }
public fun board(room: &GameRoom): vector<u8> { room.board }
public fun vault_value(room: &GameRoom): u64 { room.vault.value() }
public fun treasury(config: &ProtocolConfig): address { config.treasury }
public fun min_wager(config: &ProtocolConfig): u64 { config.min_wager }
public fun is_paused(config: &ProtocolConfig): bool { config.is_paused }

// ---------- Internal helpers ----------
/// 95% to winner, 5% to treasury. u128 intermediate math, zero overflow.
fun settle_win(
    config: &ProtocolConfig,
    room: &mut GameRoom,
    winner: address,
    reason: u8,
    ctx: &mut TxContext,
) {
    room.status = STATUS_FINISHED;
    room.winner = option::some(winner);
    let total_pot = room.vault.value();
    let protocol_fee = (((total_pot as u128) * FEE_BPS) / BPS_DENOMINATOR) as u64;
    let winner_payout = total_pot - protocol_fee;
    let prize = coin::take(&mut room.vault, winner_payout, ctx);
    transfer::public_transfer(prize, winner);
    let fee_amount = room.vault.value();
    let fee = coin::take(&mut room.vault, fee_amount, ctx);
    transfer::public_transfer(fee, config.treasury);
    event::emit(GameSettled {
        room_id: object::id(room),
        winner: option::some(winner),
        payout_winner: winner_payout,
        protocol_fee,
        reason,
    });
}

/// Check 5+ in a row from (row, col) on the 4 axes, both directions each.
/// Move has no signed integers, so a direction is (dr, dc) steps of 0/1 plus
/// a sign flag per axis: dr_neg/dc_neg step toward row/col 0 instead of 14.
fun is_five_in_a_row(board: &vector<u8>, row: u8, col: u8, piece: u8): bool {
    count_line(board, row, col, piece, 0, 1, false, false) >= 5 // horizontal
        || count_line(board, row, col, piece, 1, 0, false, false) >= 5 // vertical
        || count_line(board, row, col, piece, 1, 1, false, false) >= 5 // main diagonal
        || count_line(board, row, col, piece, 1, 1, false, true) >= 5 // anti-diagonal
}

/// 1 + matches forward + matches backward along a direction.
fun count_line(board: &vector<u8>, row: u8, col: u8, piece: u8, dr: u8, dc: u8, dr_neg: bool, dc_neg: bool): u64 {
    1 + count_dir(board, row, col, piece, dr, dc, dr_neg, dc_neg)
        + count_dir(board, row, col, piece, dr, dc, !dr_neg, !dc_neg)
}

fun count_dir(board: &vector<u8>, row: u8, col: u8, piece: u8, dr: u8, dc: u8, dr_neg: bool, dc_neg: bool): u64 {
    let mut count = 0;
    let mut r = row;
    let mut c = col;
    loop {
        // Step once; stop at the board edge instead of underflowing.
        if (dr_neg) {
            if (r < dr) { break };
            r = r - dr;
        } else {
            r = r + dr;
            if (r >= BOARD_DIM) { break };
        };
        if (dc_neg) {
            if (c < dc) { break };
            c = c - dc;
        } else {
            c = c + dc;
            if (c >= BOARD_DIM) { break };
        };
        let idx = ((r as u64) * (BOARD_DIM as u64)) + (c as u64);
        if (*vector::borrow(board, idx) == piece) {
            count = count + 1;
        } else {
            break
        };
    };
    count
}
