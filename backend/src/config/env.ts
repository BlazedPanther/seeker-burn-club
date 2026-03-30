import 'dotenv/config';
import { z } from 'zod';

const envBoolean = (defaultValue: boolean) => z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return value;
}, z.boolean()).default(defaultValue);

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TRUST_PROXY: envBoolean(false),
  TRUSTED_PROXY_CIDRS: z.string().optional(),

  // Database
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().min(1).default(20),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Solana
  SOLANA_RPC_URL: z.string().url(),
  SKR_MINT: z.string().min(32).max(44),
  TREASURY_WALLET: z.string().min(32).max(44),
  TREASURY_SKR_ATA: z.string().min(32).max(44),

  // App
  BACKEND_URL: z.string().url().optional().default('https://seeker-burn-api-production.up.railway.app'),

  // Burn config
  MIN_BURN_SKR: z.coerce.number().positive().default(1.0),
  PLATFORM_FEE_SKR: z.coerce.number().positive().default(0.01),
  TX_FRESHNESS_WINDOW: z.coerce.number().min(60).default(600),

  // Auth
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SIWS_CHALLENGE_TTL: z.coerce.number().default(300),
  SIWS_DOMAIN: z.string().default('seekerburnclub.xyz'),
  SIWS_URI: z.string().url().default('https://seekerburnclub.xyz'),
  SIWS_CHAIN: z.string().default('solana:mainnet'),

  // Metaplex
  BADGE_COLLECTION_MINT: z.string().optional(),
  MINT_AUTHORITY_SECRET_KEY: z.string().optional(),
  MINTING_ENABLED: envBoolean(true),

  // Creator fee (lamports) — charged to user during NFT mint, sent to TREASURY_WALLET
  CREATOR_FEE_LAMPORTS: z.coerce.number().min(0).default(5_000_000), // 0.005 SOL

  // Referrals
  REFERRAL_APPLY_WINDOW_DAYS: z.coerce.number().min(1).max(60).default(14),
  REFERRAL_QUALIFY_BURN_DAYS: z.coerce.number().min(1).max(30).default(3),
  REFERRAL_QUALIFY_LIFETIME_SKR: z.coerce.number().min(1).default(100),
  REFERRAL_ENFORCE_SYBIL_CHECKS: envBoolean(true),

  // Shop
  SOL_PRICE_USD: z.coerce.number().positive().default(150),
  SKR_PRICE_USD: z.coerce.number().positive().default(0.10),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
