import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

const result = await db.execute(sql`
  UPDATE badges
  SET nft_mint_status = 'PENDING',
      nft_mint_failure_reason = NULL,
      nft_mint_started_at = NULL,
      pending_claim_mint = NULL,
      pending_claim_expires_at = NULL,
      nft_tx_signature = NULL,
      nft_seed_salt = NULL
  WHERE nft_mint_status IN ('MINTING', 'MINT_FAILED', 'PENDING_CLAIM')
  RETURNING wallet_address, badge_id
`);
console.log('Reset', result.length, 'stuck badges:');
for (const r of result) console.log(' ', r);
process.exit(0);
