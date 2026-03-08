import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '../config/env.js';

/** RPC connection with request timeout to prevent hung requests from exhausting the DB pool. */
export const connection = new Connection(env.SOLANA_RPC_URL, {
  commitment: 'finalized',
  confirmTransactionInitialTimeout: 30_000,
  fetch: async (url: string | URL | Request, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout
    try {
      return await globalThis.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  },
});

export const SKR_MINT = new PublicKey(env.SKR_MINT);
export const TREASURY_WALLET = new PublicKey(env.TREASURY_WALLET);
export const TREASURY_SKR_ATA = new PublicKey(env.TREASURY_SKR_ATA);
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/**
 * Derive the user's SKR ATA from their wallet address.
 */
export function getUserSkrAta(walletAddress: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(walletAddress).toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      SKR_MINT.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/**
 * Fetch the number of decimals for the SKR mint.
 * Throws if unable to fetch — never silently defaults.
 */
let _cachedDecimals: number | null = null;
export async function getMintDecimals(): Promise<number> {
  if (_cachedDecimals !== null) return _cachedDecimals;
  const mintInfo = await connection.getParsedAccountInfo(SKR_MINT);
  const parsed = mintInfo.value?.data;
  const data = (typeof parsed === 'object' && parsed !== null && 'parsed' in parsed)
    ? (parsed as { parsed: { info: { decimals: number } } }).parsed.info
    : undefined;
  if (data?.decimals === undefined || data?.decimals === null) {
    throw new Error('FAILED_TO_FETCH_MINT_DECIMALS');
  }
  _cachedDecimals = data.decimals;
  return _cachedDecimals!;
}

/**
 * Convert a UI-unit amount string to base units (BigInt).
 */
export function parseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

/**
 * Get today's UTC date string (YYYY-MM-DD).
 */
export function todayUTC(): string {
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Get yesterday's UTC date string from a given date string.
 */
export function yesterdayUTC(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0]!;
}

/**
 * Get UTC date string from a unix timestamp (seconds).
 */
export function getUTCDateString(blockTime: number): string {
  return new Date(blockTime * 1000).toISOString().split('T')[0]!;
}

/**
 * Convert base units (BigInt) to a fixed-precision decimal string.
 * Uses pure string math to avoid floating-point precision loss.
 */
export function formatUnits(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals);
  return `${whole}.${frac}`;
}

/**
 * Add two decimal strings with fixed precision (avoids floating-point).
 */
export function addDecimalStrings(a: string, b: string, precision: number = 6): string {
  const aBase = parseUnits(a, precision);
  const bBase = parseUnits(b, precision);
  return formatUnits(aBase + bBase, precision);
}
