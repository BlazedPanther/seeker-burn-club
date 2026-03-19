import 'dotenv/config';
import postgres from 'postgres';

const execute = process.argv.includes('--execute');

const TABLES = [
  'users',
  'burns',
  'deposits',
  'badges',
  'perk_claims',
  'referrals',
  'auth_sessions',
  'auth_challenges',
  'security_logs',
  'daily_stats',
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log('=== Current row counts ===');
    for (const table of TABLES) {
      const row = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const count = (row[0] as { c: number }).c;
      console.log(`${table}=${count}`);
    }

    if (!execute) {
      console.log('\nDry run only. Re-run with --execute to reset user data.');
      return;
    }

    console.log('\n=== Executing reset ===');
    await sql.begin(async (tx) => {
      await tx.unsafe(`
        TRUNCATE TABLE
          referrals,
          perk_claims,
          badges,
          burns,
          deposits,
          auth_sessions,
          auth_challenges,
          security_logs,
          daily_stats,
          users
        RESTART IDENTITY CASCADE
      `);

      // Keep perk catalog definitions but reset counters/state tied to old data.
      await tx.unsafe(`UPDATE perks SET claimed_count = 0`);
    });

    console.log('Reset completed.');

    console.log('\n=== Row counts after reset ===');
    for (const table of TABLES) {
      const row = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const count = (row[0] as { c: number }).c;
      console.log(`${table}=${count}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
