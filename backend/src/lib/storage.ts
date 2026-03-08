/**
 * Creature NFT asset URL service.
 *
 * Uses deterministic backend URLs instead of paid decentralized storage.
 * Because creatures are generated from a deterministic seed (wallet + badgeId),
 * the backend can regenerate any image/metadata on demand — no permanent
 * storage is needed. Wallets and marketplaces fetch the URLs and get
 * the exact same GIF every time.
 *
 * If you ever want permanent Arweave storage later, swap this module
 * for an Irys-based uploader — the interface stays the same.
 */

import { env } from '../config/env.js';
import { resolveTraits, creatureSeed, generateCreatureName } from './creature.js';
import { getBadgeById } from './badges.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreatureAssetUrls {
  /** URL for the GIF image (served by backend) */
  imageUrl: string;
  /** URL for the JSON metadata (served by backend) */
  metadataUrl: string;
  /** false = backend-hosted, regenerated on demand */
  permanent: boolean;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve creature asset URLs.
 * Points to the backend's deterministic generation endpoints.
 * Zero cost — no external storage needed.
 */
export async function uploadCreatureAssets(
  wallet: string,
  badgeId: string,
  _seedSalt?: string,
): Promise<CreatureAssetUrls> {
  const def = getBadgeById(badgeId);
  if (!def) throw new Error(`Unknown badge: ${badgeId}`);

  const baseUrl = env.BACKEND_URL;
  return {
    imageUrl: `${baseUrl}/api/v1/creatures/image/${wallet}/${badgeId}.gif`,
    metadataUrl: `${baseUrl}/api/v1/creatures/metadata/${wallet}/${badgeId}.json`,
    permanent: false,
  };
}
