/// Central configuration for Sui x Lofi Caro.
/// Network defaults to mainnet per SPEC.md; override with
/// NEXT_PUBLIC_SUI_NETWORK=testnet for the hackathon demo.
/// Package + config IDs come from .env.local when set, and fall back to the
/// live mainnet deployment below. These are public on-chain IDs (not secrets),
/// so shipping them as defaults keeps the deployed site working out of the box.
export const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "mainnet") as
  | "mainnet"
  | "testnet";

export const MAINNET_PACKAGE_ID =
  "0x3a481fe1977237ae7b74b23d03817616e0a967d61e48f4f726d315e5329f1278";
export const MAINNET_CONFIG_ID =
  "0x03617ace2e68ff0ca113af3bf944b54fe272f12a30b06d16ba2f8feee16ac527";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID || MAINNET_PACKAGE_ID;
export const CONFIG_ID =
  process.env.NEXT_PUBLIC_CONFIG_ID || MAINNET_CONFIG_ID;

export const MODULE = "caro";
export const PACKAGE = PACKAGE_ID ? `${PACKAGE_ID}::${MODULE}` : "";

export const MIN_WAGER_SUI = 0.1;
export const FEE_BPS = 500; // 5%
export const TURN_TIMEOUT_MS = 300_000; // 5 minutes
export const BOARD_DIM = 15;

export const EXPLORER_TX = (digest: string) =>
  SUI_NETWORK === "mainnet"
    ? `https://suiscan.xyz/mainnet/tx/${digest}`
    : `https://suiscan.xyz/testnet/tx/${digest}`;

export const EXPLORER_OBJECT = (id: string) =>
  SUI_NETWORK === "mainnet"
    ? `https://suiscan.xyz/mainnet/object/${id}`
    : `https://suiscan.xyz/testnet/object/${id}`;

export const isConfigured = PACKAGE_ID.length > 2 && CONFIG_ID.length > 2;
