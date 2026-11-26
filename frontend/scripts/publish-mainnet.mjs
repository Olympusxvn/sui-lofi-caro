#!/usr/bin/env node
/// Publish the Sui x Lofi Caro package to Sui mainnet via the GraphQL endpoint.
///
/// Why GraphQL: the Sui CLI's gRPC transport is blocked by this machine's
/// egress proxy ("received corrupt message of type InvalidContentType" on
/// both mainnet and testnet), and public fullnodes have deprecated JSON-RPC.
/// GraphQL runs over plain HTTPS POST and works.
///
/// The private key is NEVER in this file: it is read at runtime from the
/// local wallet env file (default: ~/workspace/user/files/wallet_env.txt),
/// or from SUI_WALLET_ENV_FILE. Usage:
///   node scripts/publish-mainnet.mjs --dry    # simulate only, spend nothing
///   node scripts/publish-mainnet.mjs          # simulate, then publish for real
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY = process.argv.includes('--dry');

const walletFile =
  process.env.SUI_WALLET_ENV_FILE ??
  join(process.env.HOME ?? '', 'workspace/user/files/wallet_env.txt');
const walletLines = readFileSync(walletFile, 'utf8').split('\n');
const privkey = walletLines.find((l) => l.trim().startsWith('suiprivkey1'))?.trim();
if (!privkey) throw new Error('no suiprivkey1 line found in wallet file');
const keypair = Ed25519Keypair.fromSecretKey(privkey);
const sender = keypair.getPublicKey().toSuiAddress();

const client = new SuiGraphQLClient({
  url: 'https://graphql.mainnet.sui.io/graphql',
  network: 'mainnet',
});

// 1. Balance check — publishing a small package costs well under 1 SUI.
const { balance } = await client.getBalance({ owner: sender });
console.log('sender:        ', sender);
console.log('balance (SUI): ', Number(balance.balance) / 1e9);
if (Number(balance.balance) < 100_000_000) {
  throw new Error('balance below 0.1 SUI — fund the wallet before publishing');
}

// 2. Build the publish transaction (compiled offline with `sui move build`).
const modules = [
  readFileSync(join(ROOT, 'move/build/sui_lofi_caro/bytecode_modules/caro.mv')).toString('base64'),
];
const tx = new Transaction();
tx.setSender(sender);
// publish returns the UpgradeCap — it must be consumed, so transfer it to
// the sender (exactly what `sui client publish` does).
const [upgradeCap] = tx.publish({ modules, dependencies: ['0x1', '0x2'] });
tx.transferObjects([upgradeCap], sender);

// 3. Simulate first — validates the publish without spending anything.
const sim = await client.simulateTransaction({ transaction: tx, signer: keypair });
if (sim.$kind === 'FailedTransaction') {
  throw new Error('simulation failed: ' + sim.FailedTransaction.status.error.message);
}
console.log('simulation:     success, digest', sim.Transaction?.digest ?? '?');
if (DRY) {
  console.log('dry run only — nothing published.');
  process.exit(0);
}

// 4. Publish for real (GraphQL client selects gas payment automatically).
// signAndExecuteTransaction returns a $kind union: { $kind: 'Transaction',
// Transaction: {...} } on success, { $kind: 'FailedTransaction', ... } on failure.
const raw = await client.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
  include: { effects: true, objectChanges: true, events: true },
});
if (raw.$kind === 'FailedTransaction') {
  throw new Error('publish failed: ' + JSON.stringify(raw.FailedTransaction.status));
}
const result = raw.Transaction ?? raw;
console.log('digest:        ', result.digest);
console.log('status:        ', JSON.stringify(result.effects?.status));
const created = (result.objectChanges ?? []).filter((c) => c.type === 'created');
for (const c of created) {
  console.log('created:        ', c.objectId, c.objectType);
}
const pkg = created.find((c) => c.objectType === '0x2::package::Package');
const config = created.find((c) => c.objectType?.includes('::caro::ProtocolConfig'));
const adminCap = created.find((c) => c.objectType?.includes('::caro::AdminCap'));
console.log('PACKAGE_ID:    ', pkg?.objectId ?? '(not found)');
console.log('CONFIG_ID:     ', config?.objectId ?? '(not found)');
console.log('ADMIN_CAP_ID:  ', adminCap?.objectId ?? '(not found)');
