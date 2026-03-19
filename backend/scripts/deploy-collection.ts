/**
 * One-time script: Deploy the Burn Spirits NFT Collection on Mainnet.
 *
 * Run AFTER generating a mint authority keypair and funding it with SOL:
 *   npx tsx scripts/deploy-collection.ts
 *
 * Required env vars (in .env or Railway):
 *   MINT_AUTHORITY_SECRET_KEY  — from generate-mint-authority.ts
 *   SOLANA_RPC_URL             — mainnet RPC endpoint
 *   BACKEND_URL                — https://api.seekerburnclub.xyz
 *
 * What this does:
 *   1. Creates a new SPL mint (0 decimals) — the collection mint
 *   2. Creates mint authority's ATA and mints 1 token (collection NFT)
 *   3. Creates Metaplex Token Metadata v3 account (collection-level metadata)
 *   4. Creates Metaplex Master Edition v3 (marks it as verified collection)
 *   5. Master Edition creation locks supply at 1 forever
 *
 * Output: BADGE_COLLECTION_MINT=<address>  → set in Railway env vars
 */

import 'dotenv/config';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '../src/lib/spl-token-compat.js';
import bs58 from 'bs58';

// ── Config ────────────────────────────────────────────────────────────────────

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const MINT_AUTHORITY_SECRET_KEY = process.env.MINT_AUTHORITY_SECRET_KEY;
const BACKEND_URL = process.env.BACKEND_URL ?? 'https://api.seekerburnclub.xyz';

if (!SOLANA_RPC_URL) throw new Error('SOLANA_RPC_URL env var is required');
if (!MINT_AUTHORITY_SECRET_KEY) throw new Error('MINT_AUTHORITY_SECRET_KEY env var is required');
if (!SOLANA_RPC_URL.includes('mainnet')) {
  console.warn('⚠️  WARNING: SOLANA_RPC_URL does not contain "mainnet" — are you sure this is mainnet?');
}

const connection = new Connection(SOLANA_RPC_URL, { commitment: 'confirmed' });

// ── Token Metadata Program ────────────────────────────────────────────────────

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function findMetadataPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
}

function findMasterEditionPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
}

function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function borshU16LE(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function encodeCreateMetadataAccountV3Collection(name: string, symbol: string, uri: string): Buffer {
  return Buffer.concat([
    Buffer.from([33]),             // instruction discriminant: CreateMetadataAccountV3
    borshString(name),
    borshString(symbol),
    borshString(uri),
    borshU16LE(0),                 // sellerFeeBasisPoints = 0
    Buffer.from([0]),              // creators: Option = None
    Buffer.from([0]),              // collection: Option = None (this IS the collection)
    Buffer.from([0]),              // uses: Option = None
    Buffer.from([0]),              // is_mutable = false (collection metadata is final)
    Buffer.from([1]),              // collection_details: Option = Some (marks as sized collection)
    Buffer.from([0]),              // CollectionDetails enum variant 0 = V1
    Buffer.alloc(8),               // V1.size = 0 (u64 LE, updated automatically by Metaplex)
  ]);
}

function encodeCreateMasterEditionV3(): Buffer {
  const maxSupply = Buffer.alloc(8); // u64 LE = 0
  return Buffer.concat([
    Buffer.from([17]),   // instruction discriminant: CreateMasterEditionV3
    Buffer.from([1]),    // Option<u64> = Some
    maxSupply,           // value = 0 (no prints)
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Parse authority keypair
  const secretKeyBytes = MINT_AUTHORITY_SECRET_KEY!.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(MINT_AUTHORITY_SECRET_KEY!))
    : bs58.decode(MINT_AUTHORITY_SECRET_KEY!);
  const authority = Keypair.fromSecretKey(secretKeyBytes);

  console.log('\n=== BURN SPIRITS COLLECTION DEPLOY ===\n');
  console.log('Authority wallet:', authority.publicKey.toBase58());

  // Check SOL balance
  const balance = await connection.getBalance(authority.publicKey);
  const balanceSol = balance / 1e9;
  console.log(`SOL balance: ${balanceSol.toFixed(4)} SOL`);
  if (balanceSol < 0.05) {
    throw new Error(`Insufficient SOL: ${balanceSol} SOL. Need at least 0.05 SOL. Fund the authority wallet first.`);
  }

  // Generate a new mint keypair for the collection NFT
  const mintKeypair = Keypair.generate();
  console.log('\nCollection mint address (save this!):');
  console.log(mintKeypair.publicKey.toBase58());

  const collectionMint = mintKeypair.publicKey;
  const metadataPDA = findMetadataPDA(collectionMint);
  const masterEditionPDA = findMasterEditionPDA(collectionMint);
  const authorityAta = getAssociatedTokenAddressSync(collectionMint, authority.publicKey);

  // Collection metadata URI — points to the backend collection metadata endpoint
  const collectionMetadataUri = `${BACKEND_URL}/api/v1/collection/metadata.json`;
  console.log('Collection metadata URI:', collectionMetadataUri);

  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const { blockhash } = await connection.getLatestBlockhash('finalized');

  const tx = new Transaction();
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = blockhash;

  // 1. Create mint account
  tx.add(SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: collectionMint,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }));

  // 2. Initialize as 0-decimal mint (authority = server)
  tx.add(createInitializeMintInstruction(collectionMint, 0, authority.publicKey, authority.publicKey));

  // 3. Create authority's ATA
  tx.add(createAssociatedTokenAccountInstruction(
    authority.publicKey,
    authorityAta,
    authority.publicKey,
    collectionMint,
  ));

  // 4. Mint exactly 1 collection token to authority's ATA
  tx.add(createMintToInstruction(collectionMint, authorityAta, authority.publicKey, 1));

  // 5. Create collection-level Metaplex metadata
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPDA,              isSigner: false, isWritable: true  },
      { pubkey: collectionMint,           isSigner: false, isWritable: false },
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: true  }, // payer
      { pubkey: authority.publicKey,      isSigner: false, isWritable: false }, // updateAuthority
      { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
    ],
    data: encodeCreateMetadataAccountV3Collection('Burn Spirits', 'BURNSPIRIT', collectionMetadataUri),
  }));

  // 6. Create Master Edition (locks supply at 1)
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: masterEditionPDA,         isSigner: false, isWritable: true  },
      { pubkey: collectionMint,           isSigner: false, isWritable: true  },
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // updateAuthority
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: true  }, // payer
      { pubkey: metadataPDA,              isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
    ],
    data: encodeCreateMasterEditionV3(),
  }));

  // Do not append an extra TokenProgram SetAuthority after CreateMasterEditionV3.
  // Master Edition already enforces non-printable supply semantics for the collection NFT.

  console.log('\nSending transaction...');
  const txSig = await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  // Check balance after
  const balanceAfter = await connection.getBalance(authority.publicKey);
  const cost = (balance - balanceAfter) / 1e9;

  console.log('\n=== SUCCESS ===\n');
  console.log('Transaction signature:', txSig);
  console.log(`Cost: ${cost.toFixed(6)} SOL`);
  console.log(`Remaining balance: ${(balanceAfter / 1e9).toFixed(6)} SOL`);
  console.log('\n>>> Set this in Railway env vars:');
  console.log(`BADGE_COLLECTION_MINT=${mintKeypair.publicKey.toBase58()}`);
  console.log('\n>>> Then run to sweep remaining SOL back to your wallet:');
  console.log(`npx tsx scripts/sweep-mint-authority.ts <your-wallet-address>`);
  console.log('\nSolscan: https://solscan.io/tx/' + txSig);
}

main().catch((err) => {
  console.error('\n❌ Deploy failed:', err.message ?? err);
  process.exit(1);
});
