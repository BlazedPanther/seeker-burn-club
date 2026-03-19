/**
 * One-time script: Generate a new mint authority keypair for NFT minting.
 *
 * Run: npx tsx scripts/generate-mint-authority.ts
 *
 * Output:
 *   - Public key  → send SOL here (0.1 SOL recommended)
 *   - Private key → set as MINT_AUTHORITY_SECRET_KEY in Railway env vars
 *
 * After the collection NFT is deployed and minting is stable, you can
 * sweep any remaining SOL back to your main wallet using sweep-mint-authority.ts.
 *
 * NEVER commit the private key to git. Store it only in Railway env vars.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();

console.log('\n=== MINT AUTHORITY KEYPAIR ===\n');
console.log('Public Key (send SOL here):');
console.log(keypair.publicKey.toBase58());
console.log('\nPrivate Key — KEEP SECRET (set as MINT_AUTHORITY_SECRET_KEY in Railway):');
console.log(bs58.encode(keypair.secretKey));
console.log('\n===============================');
console.log('\nNext steps:');
console.log('1. Send 0.1 SOL to the public key above');
console.log('2. Set MINT_AUTHORITY_SECRET_KEY=<private key> in Railway');
console.log('3. Run: npx tsx scripts/deploy-collection.ts');
console.log('4. After deploy, run: npx tsx scripts/sweep-mint-authority.ts <your-wallet-address>');
console.log('\n');
