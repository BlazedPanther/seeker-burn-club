import { db } from '../src/db/client.js';
import { badges } from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

const wallet = 'HDFnM1QnUHgi4XEriaq5yvYPvzUyCZD9NHzEhmsY19S2';
const badgeId = 'STREAK_1';

const rows = await db
  .select({ badgeId: badges.badgeId, status: badges.nftMintStatus, mint: badges.nftMintAddress, pending: badges.pendingClaimMint })
  .from(badges)
  .where(eq(badges.walletAddress, wallet));
console.log('Current badge state:', JSON.stringify(rows, null, 2));

await db
  .update(badges)
  .set({
    nftMintStatus: 'PENDING',
    nftMintAddress: null,
    nftTxSignature: null,
    pendingClaimMint: null,
    pendingClaimExpiresAt: null,
  })
  .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)));

const after = await db
  .select({ badgeId: badges.badgeId, status: badges.nftMintStatus })
  .from(badges)
  .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)));
console.log('After reset:', JSON.stringify(after, null, 2));

process.exit(0);
