# Security Audit — Sui × Lofi Caro (self-audit)

**Date:** 2026-11-26
**Scope:** `move/sources/caro.move` (deployed package), `frontend/` (deployed site), wallet-connection safety for end users.
**Auditor:** project team (self-audit, not a third-party audit). This document records what was checked, how, and what was found, so anyone can reproduce it.

## Verdict

**No critical, high, or medium issues found.** One low-severity hardening item (missing security headers) and two informational notes. A user connecting a wallet to the site can only be asked to sign the five transactions listed below; the site cannot move funds, request approvals, or access keys.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 1 |
| Informational | 2 |

## What was verified

### 1. The deployed contract is the audited source (bytecode match)

- Package ID: `0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278`
- ProtocolConfig ID: `0x03617ace2e68ff0ca113af3bf944b54fe272f12a30b06d16ba2f8feee16ac527`
- Treasury (5% fee): `0x0af0ce88e416d5fb14e1f098d93cc5eaf5c89b847c39bac0c969b4c9604f9155`
- Website: https://sulogame.vercel.app/
- Source: `move/sources/caro.move` (last modified 2026-11-26 18:24, before publish ~18:35), built with Sui CLI 1.85.1.
- `sui move test --path move` re-run at audit time: **13/13 pass, 0 fail**.
- Bytecode comparison (release build vs on-chain module bytes fetched via GraphQL):
  - Both are **3,583 bytes**.
  - Local release build SHA-256: `371f38cc66d4bbebd0a33c0f0077d7097298680c363ba193ac920ced92a88292`
  - On-chain module SHA-256: `c8b6c4932f6adb73a2e515b2c9214dfb220ce8b07567fc2aa1b4d27f78e60471`
  - The two files differ in **exactly 32 bytes** — one contiguous run at offset 1373, where the local build has 32 zero bytes (the `0x0` package-address placeholder from `Move.toml`) and the on-chain module has the package ID. That is exactly the publish-time address substitution. **The deployed bytecode is the audited source.**
  - (Note: a `sui move test` build is 3,673 bytes — test mode adds the `#[test_only]` helper. Only the release build matches the chain.)

### 2. What a user actually signs

There is exactly **one** signing call site in the whole frontend: `HomePage.tsx` → `runTx()` → `dAppKit.signAndExecuteTransaction({ transaction: tx })`. All five user actions go through it, and each builds only a `moveCall` to the deployed package — no `transferObjects`, no `transferSui`, no `setSender`, no `setGasBudget` override, no raw signing.

| User action | Contract call | What moves |
| --- | --- | --- |
| Create room | `caro::create_room` | Exact wager, split from the gas coin (`tx.splitCoins(tx.gas, [wagerMist])`) — never the whole gas coin. Locked in the room vault. |
| Join room | `caro::join_room` | Exact wager (must equal the room's wager, enforced on-chain). |
| Place a piece | `caro::make_move` | Nothing. No value moves. |
| Cancel room | `caro::cancel_room` | Nothing leaves the user's control except their own 100% refund, paid by the contract. |
| Claim timeout win | `caro::claim_timeout_win` | Nothing from the caller; the contract pays the winner 95% / treasury 5%. |

- **No token approvals.** Sui has no ERC-20-style allowances, and the app never asks for one. The only value a user ever authorizes is the exact wager shown in the wallet preview, plus gas.
- **No seed phrase / private key handling.** Grep over `frontend/src`: zero matches for `privateKey`, `mnemonic`, `seedPhrase`, `eval`, `dangerouslySetInnerHTML`. The wallet (Slush or any Sui wallet via the standard dApp-kit `ConnectButton`) holds the keys; the site never sees them.
- **No auto-connect.** `createDAppKit` is created without `autoConnect`; the wallet connects only when the user clicks Connect.
- **No external code.** No third-party scripts, analytics, or remote images. Brand images are embedded base64 data URIs (`pieceImages.ts`). The only network destinations are the official Sui fullnode (`https://fullnode.mainnet.sui.io:443`) for reads and Suiscan links (opened with `target="_blank" rel="noreferrer"`).
- **Wager input is validated** (`CreateRoomModal`: finite number, ≥ 0.1 SUI) and the stake / pot / winner / fee math is shown before signing. The contract re-checks the minimum on-chain, so the UI cannot be bypassed into a below-minimum stake.
- **Room ID input is safe.** A pasted room ID is only used as a `GameRoom` object argument; Move type-checks it, so a foreign or malformed object aborts the transaction before any funds move.

### 3. Contract fund-safety review

- **No drain path.** No function lets anyone (including the admin) take funds out of a room vault except the three settlement paths: win (95% winner / 5% treasury), draw (100% refund each, 0% fee), cancel (100% refund to the creator). The `AdminCap` can only change the treasury address, pause the protocol, or change the minimum wager — it cannot touch vaults.
- **Settlement math is exact and favors the player.** Fee = `total_pot * 500 / 10_000` in `u128` (no overflow); winner gets `total_pot - fee`; the fee is taken as the remainder. On odd totals the fee rounds down, so the extra MIST goes to the winner, never to the treasury.
- **Draw refund is correct.** Creator gets `wager` back; joiner gets the remaining vault value (also `wager`).
- **Turn, bounds, and occupancy are enforced on-chain** (`make_move` checks status, turn, `row/col < 15`, empty cell). The frontend's client-side guards are cosmetic only; the contract is the authority.
- **Timeout claim is restricted to the waiting player** (the player whose turn it is *not*), and requires `Clock (0x6)` ≥ `last_move_ms + 300_000`. The system clock is the only time source.
- **Cancel always works.** `cancel_room` has no pause check, so a creator can always reclaim a 100% refund from a waiting room, even while the protocol is paused.
- **No reentrancy, no oracles, no external calls.** Settlement transfers happen at the end of the same transaction that sets the room to FINISHED; all state changes are emitted as events.

## Findings

### LOW-1 — No security headers on the website

`frontend/next.config.ts` sets only `reactStrictMode: true`. Vercel serves the app without `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, or `X-Content-Type-Options`. Impact is limited — the wallet still shows every transaction for approval, so a framing/clickjacking page cannot silently move funds — but the site should not be frameable.

**Recommendation (not yet applied):** add headers in `next.config.ts`:

```ts
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  }];
}
```

Applying it needs a redeploy of the Vercel site.

### INFO-1 — Admin centralization (by design, documented)

The `AdminCap` holder (the deployer) can pause the protocol, change the treasury, and change the minimum wager. While paused, `create_room` / `join_room` / `make_move` / `claim_timeout_win` are blocked, so funds in an in-progress game are locked until unpaused — but they cannot be stolen (no vault access), and waiting-room refunds still work. This is the emergency lever, not a backdoor. A future step could be a timelock or multisig admin; out of scope for the hackathon.

### INFO-2 — Direct contract callers stake the whole coin passed

`create_room` sets `wager = payment.value()` and locks the entire coin. The frontend always splits exactly the wager from gas, so the wallet preview matches. Anyone calling the contract directly should know the full coin they pass becomes the wager.

## Limitations

- This is a self-audit by the project team, not an independent third-party audit.
- Dependency vulnerability scanning (`npm audit`) could not run: the npm audit endpoint is blocked by this machine's egress policy (403 `policy_denied`). Dependency review was limited to the direct list — all first-party / official packages (`@mysten/*`, Next.js, React, Tailwind). Re-run `npm audit` from an unrestricted machine before relying on it.
- The frontend was reviewed as source (`frontend/src`); the deployed Vercel build was verified to render (lobby, practice board, wallet connect) but its served JS bundle was not diffed against the source build.

## How to reproduce

```bash
sui move test --path move            # 13/13 pass
sui move build --path move           # release build, caro.mv = 3,583 bytes
# Fetch on-chain module bytes via GraphQL (https://graphql.mainnet.sui.io/graphql),
# object 0x3a48...f1278, asMovePackage.module(name: "caro").bytes, and compare:
# the only difference is 32 bytes at offset 1373 (0x0 placeholder -> package ID).
grep -rn "signAndExecuteTransaction\|transferObjects\|privateKey\|mnemonic\|dangerouslySetInnerHTML" frontend/src
```
