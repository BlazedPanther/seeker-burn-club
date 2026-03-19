import { db } from '../src/db/client.js';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  UPDATE badges
  SET nft_mint_status = 'PENDING_CLAIM',
      nft_mint_address = NULL,
      nft_tx_signature = NULL,
      pending_claim_mint = NULL,
      pending_claim_expires_at = NULL
  WHERE wallet_address = 'HDFnM1QnUHgi4XEriaq5yvYPvzUyCZD9NHzEhmsY19S2'
    AND badge_id = 'STREAK_1'
  RETURNING badge_id, nft_mint_status
`);
console.log('Reset result:', JSON.stringify(r));
process.exit(0);
