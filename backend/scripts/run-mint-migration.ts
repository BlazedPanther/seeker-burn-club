import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL or DATABASE_PUBLIC_URL env var (use: railway run --service Postgres)');
  process.exit(1);
}

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
