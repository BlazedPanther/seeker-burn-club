/**
 * One-time script: Sweep remaining SOL from the mint authority wallet back to your wallet.
 *
 * Run AFTER the collection is deployed and all initial setup is done.
 * In this project, users are fee-payer for NFT claim transactions, so the
 * mint authority usually does NOT need to keep runtime SOL after setup.
 *
 * Usage:
 *   npx tsx scripts/sweep-mint-authority.ts <YOUR_DESTINATION_WALLET_ADDRESS>
 *
 * Required env vars:
 *   MINT_AUTHORITY_SECRET_KEY  — the private key of the mint authority
 *   SOLANA_RPC_URL             — mainnet RPC endpoint
 *
 * By default, the script sweeps almost everything (reserve = 0 SOL).
 * Optional: pass a reserve amount if you want to keep some SOL on authority.
 *
 * Example with reserve:
 *   npx tsx scripts/sweep-mint-authority.ts <wallet> --reserve-sol 0.01
 */

import 'dotenv/config';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const MINT_AUTHORITY_SECRET_KEY = process.env.MINT_AUTHORITY_SECRET_KEY;
const reserveIndex = process.argv.indexOf('--reserve-sol');
const reserveSolArg = reserveIndex >= 0 ? Number(process.argv[reserveIndex + 1]) : 0;
const reserveSol = Number.isFinite(reserveSolArg) && reserveSolArg >= 0 ? reserveSolArg : 0;
const RESERVE_LAMPORTS = Math.floor(reserveSol * LAMPORTS_PER_SOL);

if (!SOLANA_RPC_URL) throw new Error('SOLANA_RPC_URL env var is required');
if (!MINT_AUTHORITY_SECRET_KEY) throw new Error('MINT_AUTHORITY_SECRET_KEY env var is required');

const destinationArg = process.argv[2];
if (!destinationArg) {
  console.error('Usage: npx tsx scripts/sweep-mint-authority.ts <destination-wallet-address>');
  process.exit(1);
}

const connection = new Connection(SOLANA_RPC_URL, { commitment: 'confirmed' });

async function main() {
  const secretKeyBytes = MINT_AUTHORITY_SECRET_KEY!.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(MINT_AUTHORITY_SECRET_KEY!))
    : bs58.decode(MINT_AUTHORITY_SECRET_KEY!);
  const authority = Keypair.fromSecretKey(secretKeyBytes);

  let destination: PublicKey;
  try {
    destination = new PublicKey(destinationArg);
  } catch {
    throw new Error(`Invalid destination wallet address: ${destinationArg}`);
  }

  console.log('\n=== SWEEP MINT AUTHORITY SOL ===\n');
  console.log('From (authority):', authority.publicKey.toBase58());
  console.log('To (your wallet):', destination.toBase58());

  const balance = await connection.getBalance(authority.publicKey);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  console.log(`Current balance: ${balanceSol.toFixed(6)} SOL`);

  // Estimate transaction fee (~5000 lamports)
  const estimatedFee = 5_000;
  const sweepLamports = balance - RESERVE_LAMPORTS - estimatedFee;

  if (sweepLamports <= 0) {
    console.log(`\nBalance (${balanceSol.toFixed(6)} SOL) is at or below reserve (${reserveSol.toFixed(6)} SOL). Nothing to sweep.`);
    return;
  }

  const sweepSol = sweepLamports / LAMPORTS_PER_SOL;
  console.log(`Sweeping: ${sweepSol.toFixed(6)} SOL`);
  console.log(`Keeping reserve: ${(RESERVE_LAMPORTS / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  const { blockhash } = await connection.getLatestBlockhash('finalized');
  const tx = new Transaction();
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = blockhash;
  tx.add(SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: destination,
    lamports: sweepLamports,
  }));

  const txSig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: 'confirmed' });

  const balanceAfter = await connection.getBalance(authority.publicKey);
  console.log('\n=== SUCCESS ===\n');
  console.log('Transaction signature:', txSig);
  console.log(`Sent: ${sweepSol.toFixed(6)} SOL`);
  console.log(`Remaining in authority: ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log('Solscan: https://solscan.io/tx/' + txSig);
}

main().catch((err) => {
  console.error('\n❌ Sweep failed:', err.message ?? err);
  process.exit(1);
});
