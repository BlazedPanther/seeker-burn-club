/**
 * Dynamic price oracle — fetches live SOL & SKR prices from Jupiter.
 *
 * Prices are cached in Redis for 5 minutes. If the API is unavailable,
 * falls back to env-configured fixed prices (`SOL_PRICE_USD` / `SKR_PRICE_USD`).
 */
import { redis } from './redis.js';
import { env } from '../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'price-oracle' });

// Jupiter V2 price endpoint
const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const CACHE_KEY = 'prices:sol_skr_usd';
const CACHE_TTL_SECONDS = 300; // 5 minutes
const FETCH_TIMEOUT_MS = 8_000;

export interface TokenPrices {
  solUsd: number;
  skrUsd: number;
  source: 'live' | 'cached' | 'fallback';
  cachedAt?: string; // ISO timestamp
}

/**
 * Get current USD prices for SOL and SKR.
 * Priority: Redis cache → Jupiter API → env fallback.
 */
export async function getTokenPrices(): Promise<TokenPrices> {
  // 1. Try Redis cache
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { solUsd: number; skrUsd: number; cachedAt: string };
      if (parsed.solUsd > 0 && parsed.skrUsd > 0) {
        return { ...parsed, source: 'cached' };
      }
    }
  } catch { /* Redis down — continue */ }

  // 2. Fetch from Jupiter
  try {
    const url = `${JUPITER_PRICE_URL}?ids=${SOL_MINT},${env.SKR_MINT}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Jupiter API returned ${res.status}`);
    }

    const body = (await res.json()) as {
      data: Record<string, { price: string } | undefined>;
    };

    const solPrice = parseFloat(body.data?.[SOL_MINT]?.price ?? '0');
    const skrPrice = parseFloat(body.data?.[env.SKR_MINT]?.price ?? '0');

    if (solPrice <= 0 || skrPrice <= 0) {
      throw new Error(`Invalid prices from Jupiter: SOL=${solPrice}, SKR=${skrPrice}`);
    }

    const cachedAt = new Date().toISOString();
    const prices: TokenPrices = { solUsd: solPrice, skrUsd: skrPrice, source: 'live', cachedAt };

    // Cache in Redis
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify({ solUsd: solPrice, skrUsd: skrPrice, cachedAt }));
    } catch { /* Redis down — prices still usable */ }

    logger.info({ solUsd: solPrice, skrUsd: skrPrice }, 'Fetched live prices from Jupiter');
    return prices;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Failed to fetch prices from Jupiter, using fallback');
  }

  // 3. Fallback to env vars
  return {
    solUsd: env.SOL_PRICE_USD,
    skrUsd: env.SKR_PRICE_USD,
    source: 'fallback',
  };
}
