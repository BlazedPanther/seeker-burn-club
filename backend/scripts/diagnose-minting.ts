import 'dotenv/config';
import { env } from '../src/config/env.js';
import { checkMintAuthority } from '../src/lib/nft.js';
import postgres from 'postgres';

async function diagnose() {
  console.log('=== ENV CONFIG ===');
  console.log('MINTING_ENABLED:', env.MINTING_ENABLED);
  console.log('MINT_AUTHORITY_SECRET_KEY set:', !!env.MINT_AUTHORITY_SECRET_KEY);
  console.log('MINT_AUTHORITY_SECRET_KEY length:', env.MINT_AUTHORITY_SECRET_KEY?.length ?? 0);
  console.log('BADGE_COLLECTION_MINT:', env.BADGE_COLLECTION_MINT || '(not set)');
  console.log('CREATOR_FEE_LAMPORTS:', env.CREATOR_FEE_LAMPORTS);
  console.log('SOLANA_RPC_URL:', env.SOLANA_RPC_URL?.substring(0, 40) + '...');
  console.log('BACKEND_URL:', env.BACKEND_URL);

  console.log('\n=== MINT AUTHORITY ===');
  const auth = await checkMintAuthority();
  console.log('Configured:', auth.configured);
  console.log('Public Key:', auth.publicKey ?? 'N/A');
  console.log('SOL Balance:', auth.solBalance ?? 'N/A');

  console.log('\n=== DB BADGE STATUS ===');
  const sql = postgres(env.DATABASE_URL);
  const stats = await sql`
    SELECT nft_mint_status, COUNT(*)::int as count
    FROM badges
    GROUP BY nft_mint_status
    ORDER BY count DESC
  `;
  console.table(stats);

  const stuck = await sql`
    SELECT badge_id, wallet_address, nft_mint_status, nft_mint_failure_reason,
           nft_tx_signature, nft_mint_started_at, nft_mint_address, created_at
    FROM badges
    WHERE nft_mint_status IN ('MINTING', 'MINT_FAILED', 'PENDING_CLAIM')
    ORDER BY created_at DESC
    LIMIT 10
  `;
  if (stuck.length > 0) {
    console.log('\n=== STUCK/FAILED BADGES ===');
    for (const row of stuck) {
      console.log(`  ${row.badge_id} | ${row.wallet_address?.substring(0, 8)}... | status=${row.nft_mint_status} | reason=${row.nft_mint_failure_reason ?? 'none'} | tx=${row.nft_tx_signature?.substring(0, 16) ?? 'none'}... | started=${row.nft_mint_started_at ?? 'null'}`);
    }
  } else {
    console.log('\nNo stuck/failed badges found.');
  }

  const completed = await sql`
    SELECT badge_id, wallet_address, nft_mint_address, nft_tx_signature
    FROM badges
    WHERE nft_mint_status = 'COMPLETED'
    LIMIT 5
  `;
  if (completed.length > 0) {
    console.log('\n=== COMPLETED MINTS ===');
    for (const row of completed) {
      console.log(`  ${row.badge_id} | ${row.wallet_address?.substring(0, 8)}... | mint=${row.nft_mint_address} | tx=${row.nft_tx_signature}`);
    }
  } else {
    console.log('\nNo completed mints found.');
  }

  await sql.end();
}

diagnose().catch(err => { console.error('Diagnose error:', err); process.exit(1); });
