const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new Client({ connectionString: url });

async function main() {
  await client.connect();
  const res = await client.query(`
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
  console.log('Reset result:', res.rows);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
