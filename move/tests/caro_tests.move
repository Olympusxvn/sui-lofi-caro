/// Unit tests for Sui x Lofi Caro (see docs/RULE.md §4).
/// Covers: horizontal / vertical / diagonal wins with exact 95% / 5% payouts,
/// draw 50/50 refund, room cancellation, timeout win, and failure aborts
/// (wrong turn, wrong wager, occupied cell, self-play, wager too low).
#[test_only]
module sui_lofi_caro::caro_tests;

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario::{Self, Scenario};
use sui_lofi_caro::caro::{Self, GameRoom, ProtocolConfig};

const ADMIN: address = @0xAD;
const CREATOR: address = @0xCAFE;
const JOINER: address = @0xBEEF;
const WAGER: u64 = 1_000_000_000; // 1 SUI
const FEE_5_PCT: u64 = 100_000_000; // 5% of the 2 SUI pot
const WINNER_PAYOUT: u64 = 1_900_000_000; // 95% of the 2 SUI pot

// ---------- Setup helpers ----------
fun setup(): (Scenario, Clock) {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        caro::init_for_testing(ctx);
    };
    let clock = {
        let ctx = test_scenario::ctx(&mut scenario);
        clock::create_for_testing(ctx)
    };
    (scenario, clock)
}

fun create_room(scenario: &mut Scenario, clock: &Clock, player: address, wager: u64) {
    test_scenario::next_tx(scenario, player);
    let config = test_scenario::take_shared<ProtocolConfig>(scenario);
    let payment = coin::mint_for_testing<SUI>(wager, test_scenario::ctx(scenario));
    caro::create_room(&config, payment, clock, test_scenario::ctx(scenario));
    test_scenario::return_shared(config);
}

fun join_room(scenario: &mut Scenario, clock: &Clock, player: address, wager: u64) {
    test_scenario::next_tx(scenario, player);
    let config = test_scenario::take_shared<ProtocolConfig>(scenario);
    let mut room = test_scenario::take_shared<GameRoom>(scenario);
    let payment = coin::mint_for_testing<SUI>(wager, test_scenario::ctx(scenario));
    caro::join_room(&config, &mut room, payment, clock, test_scenario::ctx(scenario));
    test_scenario::return_shared(config);
    test_scenario::return_shared(room);
}

fun play(scenario: &mut Scenario, clock: &Clock, player: address, row: u8, col: u8) {
    test_scenario::next_tx(scenario, player);
    let config = test_scenario::take_shared<ProtocolConfig>(scenario);
    let mut room = test_scenario::take_shared<GameRoom>(scenario);
    caro::make_move(&config, &mut room, row, col, clock, test_scenario::ctx(scenario));
    test_scenario::return_shared(config);
    test_scenario::return_shared(room);
}

fun start_match(): (Scenario, Clock) {
    let (mut scenario, clock) = setup();
    create_room(&mut scenario, &clock, CREATOR, WAGER);
    join_room(&mut scenario, &clock, JOINER, WAGER);
    (scenario, clock)
}

fun assert_room_finished(scenario: &mut Scenario, expected_winner: Option<address>) {
    // A shared object returned in the previous tx is only takeable again
    // after next_tx opens a new one; without it take_shared aborts
    // EEmptyInventory even though the room still exists.
    test_scenario::next_tx(scenario, ADMIN);
    let room = test_scenario::take_shared<GameRoom>(scenario);
    assert!(caro::status(&room) == 2, 100);
    assert!(caro::winner(&room) == expected_winner, 101);
    test_scenario::return_shared(room);
}

fun assert_coin_balance(scenario: &mut Scenario, owner: address, expected: u64) {
    test_scenario::next_tx(scenario, owner);
    let coin = test_scenario::take_from_sender<Coin<SUI>>(scenario);
    assert!(coin.value() == expected, 102);
    test_scenario::return_to_sender(scenario, coin);
}

// ---------- Win tests ----------
#[test]
fun test_horizontal_win_payout() {
    let (mut scenario, clock) = start_match();
    // X builds a horizontal five on row 7; O plays harmless stones on row 0.
    play(&mut scenario, &clock, CREATOR, 7, 3);
    play(&mut scenario, &clock, JOINER, 0, 0);
    play(&mut scenario, &clock, CREATOR, 7, 4);
    play(&mut scenario, &clock, JOINER, 0, 1);
    play(&mut scenario, &clock, CREATOR, 7, 5);
    play(&mut scenario, &clock, JOINER, 0, 2);
    play(&mut scenario, &clock, CREATOR, 7, 6);
    play(&mut scenario, &clock, JOINER, 0, 3);
    play(&mut scenario, &clock, CREATOR, 7, 7);
    assert_room_finished(&mut scenario, option::some(CREATOR));
    assert_coin_balance(&mut scenario, CREATOR, WINNER_PAYOUT);
    assert_coin_balance(&mut scenario, ADMIN, FEE_5_PCT);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test]
fun test_vertical_win_payout() {
    let (mut scenario, clock) = start_match();
    // X builds a vertical five in column 7; O plays harmless stones in column 0.
    play(&mut scenario, &clock, CREATOR, 3, 7);
    play(&mut scenario, &clock, JOINER, 0, 0);
    play(&mut scenario, &clock, CREATOR, 4, 7);
    play(&mut scenario, &clock, JOINER, 1, 0);
    play(&mut scenario, &clock, CREATOR, 5, 7);
    play(&mut scenario, &clock, JOINER, 2, 0);
    play(&mut scenario, &clock, CREATOR, 6, 7);
    play(&mut scenario, &clock, JOINER, 3, 0);
    play(&mut scenario, &clock, CREATOR, 7, 7);
    assert_room_finished(&mut scenario, option::some(CREATOR));
    assert_coin_balance(&mut scenario, CREATOR, WINNER_PAYOUT);
    assert_coin_balance(&mut scenario, ADMIN, FEE_5_PCT);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test]
fun test_diagonal_win_payout() {
    let (mut scenario, clock) = start_match();
    // X builds a main-diagonal five; O plays harmless stones on row 0.
    play(&mut scenario, &clock, CREATOR, 3, 3);
    play(&mut scenario, &clock, JOINER, 0, 5);
    play(&mut scenario, &clock, CREATOR, 4, 4);
    play(&mut scenario, &clock, JOINER, 0, 6);
    play(&mut scenario, &clock, CREATOR, 5, 5);
    play(&mut scenario, &clock, JOINER, 0, 7);
    play(&mut scenario, &clock, CREATOR, 6, 6);
    play(&mut scenario, &clock, JOINER, 0, 8);
    play(&mut scenario, &clock, CREATOR, 7, 7);
    assert_room_finished(&mut scenario, option::some(CREATOR));
    assert_coin_balance(&mut scenario, CREATOR, WINNER_PAYOUT);
    assert_coin_balance(&mut scenario, ADMIN, FEE_5_PCT);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test]
fun test_anti_diagonal_win_payout() {
    let (mut scenario, clock) = start_match();
    // O (second player) wins on the anti-diagonal; X plays harmless stones.
    play(&mut scenario, &clock, CREATOR, 0, 0);
    play(&mut scenario, &clock, JOINER, 3, 7);
    play(&mut scenario, &clock, CREATOR, 0, 1);
    play(&mut scenario, &clock, JOINER, 4, 6);
    play(&mut scenario, &clock, CREATOR, 0, 2);
    play(&mut scenario, &clock, JOINER, 5, 5);
    play(&mut scenario, &clock, CREATOR, 0, 3);
    play(&mut scenario, &clock, JOINER, 6, 4);
    play(&mut scenario, &clock, CREATOR, 1, 0);
    play(&mut scenario, &clock, JOINER, 7, 3);
    assert_room_finished(&mut scenario, option::some(JOINER));
    assert_coin_balance(&mut scenario, JOINER, WINNER_PAYOUT);
    assert_coin_balance(&mut scenario, ADMIN, FEE_5_PCT);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

// ---------- Draw / cancel / timeout ----------
#[test]
fun test_draw_refunds_both_players() {
    let (mut scenario, clock) = start_match();
    // Fill the board with the verified draw pattern (max run 2 in any
    // direction, 113 X-cells / 112 O-cells): piece = 1 iff (2r + c) % 4 < 2.
    // Interleave X-cells and O-cells so turns alternate correctly.
    let mut xs = vector::empty<vector<u8>>();
    let mut os = vector::empty<vector<u8>>();
    let mut r = 0u8;
    while (r < 15) {
        let mut c = 0u8;
        while (c < 15) {
            let cell = vector[r, c];
            if (((2 * r + c) % 4) < 2) {
                vector::push_back(&mut xs, cell);
            } else {
                vector::push_back(&mut os, cell);
            };
            c = c + 1;
        };
        r = r + 1;
    };
    let mut i = 0;
    while (i < 112) {
        let xcell = *vector::borrow(&xs, i);
        play(&mut scenario, &clock, CREATOR, *vector::borrow(&xcell, 0), *vector::borrow(&xcell, 1));
        let ocell = *vector::borrow(&os, i);
        play(&mut scenario, &clock, JOINER, *vector::borrow(&ocell, 0), *vector::borrow(&ocell, 1));
        i = i + 1;
    };
    // 225th move (X) fills the last X-cell: draw, 0% fee.
    let last = *vector::borrow(&xs, 112);
    play(&mut scenario, &clock, CREATOR, *vector::borrow(&last, 0), *vector::borrow(&last, 1));
    assert_room_finished(&mut scenario, option::none());
    assert_coin_balance(&mut scenario, CREATOR, WAGER);
    assert_coin_balance(&mut scenario, JOINER, WAGER);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test]
fun test_cancel_room_refunds_creator() {
    let (mut scenario, clock) = setup();
    create_room(&mut scenario, &clock, CREATOR, WAGER);
    test_scenario::next_tx(&mut scenario, CREATOR);
    let mut room = test_scenario::take_shared<GameRoom>(&scenario);
    caro::cancel_room(&mut room, test_scenario::ctx(&mut scenario));
    assert!(caro::status(&room) == 3, 103);
    test_scenario::return_shared(room);
    assert_coin_balance(&mut scenario, CREATOR, WAGER);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test]
fun test_timeout_win_claim() {
    let (mut scenario, mut clock) = start_match();
    play(&mut scenario, &clock, CREATOR, 7, 7);
    // After X moves it is O's turn, so O is the stalled player and X (the
    // waiting player) claims the timeout win. Advance past the 5-minute
    // deadline first.
    clock.increment_for_testing(300_001);
    test_scenario::next_tx(&mut scenario, CREATOR);
    let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
    let mut room = test_scenario::take_shared<GameRoom>(&scenario);
    caro::claim_timeout_win(&config, &mut room, &clock, test_scenario::ctx(&mut scenario));
    test_scenario::return_shared(config);
    test_scenario::return_shared(room);
    assert_room_finished(&mut scenario, option::some(CREATOR));
    assert_coin_balance(&mut scenario, CREATOR, WINNER_PAYOUT);
    assert_coin_balance(&mut scenario, ADMIN, FEE_5_PCT);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

// ---------- Failure tests ----------
#[test, expected_failure(abort_code = 2)]
fun test_create_wager_too_low() {
    let (mut scenario, clock) = setup();
    create_room(&mut scenario, &clock, CREATOR, 50_000_000); // 0.05 SUI < 0.1 min
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 5)]
fun test_self_play_not_allowed() {
    let (mut scenario, clock) = setup();
    create_room(&mut scenario, &clock, CREATOR, WAGER);
    join_room(&mut scenario, &clock, CREATOR, WAGER);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 3)]
fun test_join_wrong_wager() {
    let (mut scenario, clock) = setup();
    create_room(&mut scenario, &clock, CREATOR, WAGER);
    join_room(&mut scenario, &clock, JOINER, WAGER / 2);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 7)]
fun test_wrong_turn() {
    let (mut scenario, clock) = start_match();
    // O tries to move first; X always moves first.
    play(&mut scenario, &clock, JOINER, 7, 7);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 9)]
fun test_occupied_cell() {
    let (mut scenario, clock) = start_match();
    play(&mut scenario, &clock, CREATOR, 7, 7);
    play(&mut scenario, &clock, JOINER, 0, 0);
    play(&mut scenario, &clock, CREATOR, 7, 7); // already occupied by X
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = 10)]
fun test_timeout_too_early() {
    let (mut scenario, mut clock) = start_match();
    play(&mut scenario, &clock, CREATOR, 7, 7);
    // Only 1 minute passed; the 5-minute deadline is not reached.
    clock.increment_for_testing(60_000);
    test_scenario::next_tx(&mut scenario, JOINER);
    let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
    let mut room = test_scenario::take_shared<GameRoom>(&scenario);
    caro::claim_timeout_win(&config, &mut room, &clock, test_scenario::ctx(&mut scenario));
    test_scenario::return_shared(config);
    test_scenario::return_shared(room);
    clock::destroy_for_testing(clock);
    test_scenario::end(scenario);
}
