import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

// Use Railway's mainnet RPC
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const conn = new Connection(RPC_URL, 'confirmed');

// Read mint authority from Railway env or local
const MINT_AUTH_KEY = process.env.MINT_AUTHORITY_SECRET_KEY;

async function check() {
  console.log('=== MINT AUTHORITY BALANCE CHECK (Mainnet) ===\n');

  if (!MINT_AUTH_KEY) {
    console.log('MINT_AUTHORITY_SECRET_KEY not set locally, using Railway value...');
    console.log('Run this on Railway or set the key locally.');
    return;
  }

  const bytes = MINT_AUTH_KEY.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(MINT_AUTH_KEY))
    : bs58.decode(MINT_AUTH_KEY);
  const authority = Keypair.fromSecretKey(bytes);

  console.log('Authority pubkey:', authority.publicKey.toBase58());

  const balance = await conn.getBalance(authority.publicKey);
  console.log('SOL Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  console.log('Balance in lamports:', balance);

  // Each NFT mint costs roughly:
  // - Mint account rent: ~0.00144 SOL
  // - ATA rent: ~0.00204 SOL
  // - Metadata account rent: ~0.0056 SOL
  // - Master edition rent: ~0.0028 SOL
  // - Total rent per NFT: ~0.012 SOL
  // - Tx fee: ~0.000015 SOL (priority fee included)
  const COST_PER_MINT = 0.015; // conservative estimate
  console.log(`\nEstimated mints possible: ${Math.floor(balance / LAMPORTS_PER_SOL / COST_PER_MINT)}`);
  console.log(`(Assuming ~${COST_PER_MINT} SOL per mint)`);

  // Check recent signatures to see if any txs were sent
  console.log('\n=== RECENT TRANSACTIONS ===');
  try {
    const sigs = await conn.getSignaturesForAddress(authority.publicKey, { limit: 10 });
    if (sigs.length === 0) {
      console.log('NO transactions found for this authority on mainnet!');
      console.log('This means the mint txs are being sent but never land on-chain.');
    } else {
      for (const sig of sigs) {
        console.log(`  ${sig.signature.substring(0, 20)}... | ${sig.err ? 'FAILED: ' + JSON.stringify(sig.err) : 'OK'} | slot=${sig.slot} | time=${sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'unknown'}`);
      }
    }
  } catch (err) {
    console.log('Error fetching signatures:', err);
  }

  // Check the specific failed signatures from logs
  const failedSigs = [
    '3xsg3DNFL7CFzQersbL1cHtGRGHbuK9khvEnPJ31RLw91iyiSpNuMyhk7aCBZfDa8CxjBBtXPNpwzhn9dNZyfiW7',
    '55Ngh1aRMMB6fA6JKUtrrwpquFx4tCVMhxu74UdGX63Pugwx9tr9mcNpA61F29g4877QjhtkcZx7SVAM4Rz2NRKS',
    '2iXDSWeNZ8WTKkgpNvnWgx1Wce9rAFVQNczFDkHYdG3M1c6ALgVbiSmCBf78Lwd5dfHYAB8jqvnpUM6fjHQDBKHo',
    '37mxoFuXjbhxa1gqdwm4YwJoFLcid2xvyzBQgtzHxVw8EWENZ58nTcPkff4St52X6Z5fYyURsDpty7S5CydCR59v',
  ];
  console.log('\n=== CHECKING FAILED TX SIGNATURES ===');
  for (const sig of failedSigs) {
    try {
      const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (tx) {
        console.log(`  ${sig.substring(0, 20)}... FOUND ON-CHAIN! err=${JSON.stringify(tx.meta?.err)}`);
      } else {
        console.log(`  ${sig.substring(0, 20)}... NOT found on-chain (tx dropped/expired)`);
      }
    } catch (err) {
      console.log(`  ${sig.substring(0, 20)}... ERROR checking: ${err}`);
    }
  }
}

check().catch(err => { console.error(err); process.exit(1); });
