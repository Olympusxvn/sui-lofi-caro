#!/usr/bin/env node
/// Move the 5% protocol fee recipient (ProtocolConfig.treasury) to a new address.
///
/// Called by the admin (the deployer, holder of AdminCap) via
/// caro::update_treasury. The fee is paid out atomically inside each
/// settlement transaction, so the new treasury takes effect immediately for
/// every game finished after this call.
///
/// The private key is NEVER in this file: it is read at runtime from the
/// local wallet env file (default: ~/workspace/user/files/wallet_env.txt),
/// or from SUI_WALLET_ENV_FILE. Usage:
///   node frontend/scripts/update-treasury.mjs <new-treasury-address> [--dry]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const PKG = '0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278';
const CONFIG_ID = '0x03617ace2e68ff0ca113af3bf944b54fe272f12a30b06d16ba2f8feee16ac527';
const ADMIN_CAP_ID = '0x38cfd3803fc3fed49e80944ee86a27d24dfd876dba001c44c59b87402946c8e4';

const newTreasury = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!/^0x[0-9a-fA-F]{64}$/.test(newTreasury ?? '')) {
  throw new Error('usage: update-treasury.mjs <0x...64-hex-address> [--dry]');
}

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

const tx = new Transaction();
tx.setSender(sender);
tx.moveCall({
  target: `${PKG}::caro::update_treasury`,
  arguments: [tx.object(ADMIN_CAP_ID), tx.object(CONFIG_ID), tx.pure.address(newTreasury)],
});

const sim = await client.simulateTransaction({ transaction: tx, signer: keypair });
if (sim.$kind === 'FailedTransaction') {
  throw new Error('simulation failed: ' + sim.FailedTransaction.status.error.message);
}
console.log('simulation: success');
if (DRY) {
  console.log('dry run only — treasury unchanged.');
  process.exit(0);
}

const raw = await client.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
  include: { effects: true },
});
if (raw.$kind === 'FailedTransaction') {
  throw new Error('update failed: ' + JSON.stringify(raw.FailedTransaction.status));
}
console.log('digest:    ', raw.Transaction?.digest);

// Read back the config to confirm the new treasury.
const cfg = await client.query({
  query: `query Q { object(address: "${CONFIG_ID}") { asMoveObject { contents { json } } } }`,
});
console.log('treasury now:', cfg.data?.object?.asMoveObject?.contents?.json?.treasury);
