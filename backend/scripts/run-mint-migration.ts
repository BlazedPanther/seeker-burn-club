import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL
  || 'REDACTED_DB_URL';

const sql = postgres(DATABASE_URL);

async function main() {
  console.log('Running mint recovery migration...');
  await sql`ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_started_at TIMESTAMPTZ`;
  await sql`ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_failure_reason TEXT`;

  // Backfill any existing MINTING rows so recovery job can pick them up
  const result = await sql`
    UPDATE badges
    SET nft_mint_started_at = created_at
    WHERE nft_mint_status = 'MINTING' AND nft_mint_started_at IS NULL
  `;
  console.log(`Backfilled ${result.count} existing MINTING rows`);
  console.log('Migration OK');
  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
