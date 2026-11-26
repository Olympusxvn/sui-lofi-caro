# Sui × Lofi Caro — On-Chain Gomoku PvP

On-chain PvP Gomoku (Five-in-a-Row) on Sui, built for the **CLAY Hackathon III (Code Like a Yeti)** — Mini-game track.

Two players stake SUI in an on-chain vault. First to five in a row on the 15×15 board takes **95%** of the pot; **5%** goes to the protocol treasury. Draws refund 100% (0% fee). Every move, win check and payout runs in the Move contract — no server, no trust.

- **Player 1 (X):** Sui droplet logo, moves first.
- **Player 2 (O):** Lofi the Yeti head logo, moves second.
- **No NFTs, no custom tokens** — only native SUI, ever.

## Repo layout

```text
sui-lofi-caro/
├── docs/            # PROJECT.md, PRD.md, SPEC.md, RULE.md, MUSE_PROMPT.txt
├── move/            # Sui Move package (edition 2024)
│   ├── Move.toml
│   ├── sources/caro.move
│   └── tests/caro_tests.move
└── frontend/        # Next.js 15 + React 19 + Tailwind v4 + Sui SDK v2
```

## Smart contract

| Item | Value |
| --- | --- |
| Board | `vector<u8>` length 225: `0` empty, `1` Sui (X), `2` Lofi (O) |
| Min wager | `0.1 SUI` (100,000,000 MIST) |
| Fee | `500 bps` (5%) — `u128` intermediate math, zero overflow |
| Payout | Winner `95%`, treasury `5%` |
| Timeout | `300,000 ms` (5 min) per turn, `Clock` (`0x6`) enforced |
| Statuses | `0` WAITING, `1` IN_PROGRESS, `2` FINISHED, `3` CANCELLED |

Functions: `create_room`, `join_room`, `make_move`, `cancel_room`, `claim_timeout_win`,
plus admin `update_treasury` / `set_paused` / `set_min_wager` (via `AdminCap`).

### Test the contract

```bash
sui move test --path move
```

Tests cover horizontal / vertical / diagonal / anti-diagonal wins with exact 95% / 5%
balance assertions, draw 50/50 refund, room cancellation, timeout win, and aborts for
wrong turn, wrong wager, occupied cell, self-play, wager too low, and early timeout.

## Live deployment (mainnet, 2026-11-26)

- **Package ID:** `0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278`
- **ProtocolConfig ID:** `0x03617ace2e68ff0ca113af3bf944b54fe272f12a30b06d16ba2f8feee16ac527`
- **Suiscan:** https://suiscan.xyz/mainnet/object/0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278
- **Publish cost:** 0.0365 SUI (gas + storage). Tests: 13/13 pass (`sui move test`).
- **Publish script:** `frontend/scripts/publish-mainnet.mjs` (GraphQL endpoint; the Sui CLI's
  gRPC transport is blocked by this machine's egress proxy, and public fullnodes
  have deprecated JSON-RPC). The key is read at runtime from a local wallet file
  and is never in this repo.

To republish (new package — Move packages are immutable):
```bash
sui move build --path move   # offline; produces move/build/.../caro.mv
node frontend/scripts/publish-mainnet.mjs --dry   # simulate only
node frontend/scripts/publish-mainnet.mjs        # publish for real
# Then update MAINNET_PACKAGE_ID / MAINNET_CONFIG_ID in
# frontend/src/constants/config.ts (env vars override them).
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
npm run build  # production build check
```

Features: Slush Wallet + standard Sui wallets, live SUI balance, lobby with open rooms,
create-room modal with transparent 95% / 5% stake math, 15×15 ice board with last-move
and winning-line highlights, 1.5 s room polling, 5-minute turn timer with timeout claim,
victory/draw modal with Suiscan links, and a free off-chain practice board (no wallet).

## Security notes

- Never commit `.env.local` or any private key / mnemonic. The deployer key lives only in
  your local Sui keystore (`~/.sui`), never in this repo.
- The contract never holds pooled funds beyond one match vault, has no withdrawal
  function, and pays out atomically inside the winning/timeout/draw transaction.

## Submission checklist (CLAY Hackathon)

- [ ] Public GitHub repo (this one)
- [ ] Demo video, 3–5 minutes (YouTube link preferred)
- [ ] Project logo, 1:1 (the Lofi yeti head PNG from the LOFI.rar asset pack; in the app it is embedded as a data URI in `frontend/src/components/pieceImages.ts`)
- [ ] Website (deploy the frontend; Vercel works)
- [x] Package ID `0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278` (mainnet, live 2026-11-26)
