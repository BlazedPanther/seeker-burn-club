/**
 * NFT minting service for Seeker Burn Club badge NFTs.
 *
 * Uses only @solana/web3.js + internal SPL token helpers (no extra Metaplex dependencies).
 * Manually constructs Metaplex Token Metadata Program instructions via Borsh encoding.
 *
 * Two-phase flow:
 * 1. User signs a simple SOL transfer (creator fee) — wallet simulates it perfectly.
 * 2. Server mints the full NFT after confirming payment (create mint, ATA, metadata, master edition).
 *
 * Requires env vars:
 *   MINT_AUTHORITY_SECRET_KEY  — base58 or JSON-array of the authority keypair
 *   BACKEND_URL                — used to build the off-chain metadata URI
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from './spl-token-compat.js';
import { connection } from './solana.js';
import { getBadgeById } from './badges.js';
import { creatureSeed, resolveTraits, generateCreatureName } from './creature.js';
import { uploadCreatureAssets } from './storage.js';
import { env } from '../config/env.js';
import bs58 from 'bs58';

// ── Token Metadata Program ────────────────────────────────────────────────────

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

function findMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );
  return pda;
}

export function findMasterEditionPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  return pda;
}

// ── Minimal Borsh serialization helpers ──────────────────────────────────────

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

/**
 * Encode the CreateMetadataAccountV3 instruction data.
 * Instruction index: 33 (0x21)
 */
function encodeCreateMetadataAccountV3(params: {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  isMutable: boolean;
  collectionMint?: PublicKey;
}): Buffer {
  const collectionBuf = params.collectionMint
    ? Buffer.concat([
        Buffer.from([1]),                                  // Option = Some
        Buffer.from([0]),                                  // verified = false (verified later by authority)
        params.collectionMint.toBuffer(),                  // Collection mint pubkey
      ])
    : Buffer.from([0]);                                    // Option = None

  return Buffer.concat([
    Buffer.from([33]),                         // instruction discriminant
    borshString(params.name),
    borshString(params.symbol),
    borshString(params.uri),
    borshU16LE(params.sellerFeeBasisPoints),
    Buffer.from([0]),                          // creators: Option = None
    collectionBuf,                             // collection: Option<Collection>
    Buffer.from([0]),                          // uses: Option = None
    Buffer.from([params.isMutable ? 1 : 0]),   // is_mutable
    Buffer.from([0]),                          // collection_details: Option = None
  ]);
}

/**
 * Encode the CreateMasterEditionV3 instruction data.
 * Instruction index: 17 (0x11), maxSupply = Some(0)
 */
function encodeCreateMasterEditionV3(): Buffer {
  const maxSupply = Buffer.alloc(8); // u64 LE = 0
  return Buffer.concat([
    Buffer.from([17]),  // instruction discriminant
    Buffer.from([1]),   // Option<u64> = Some
    maxSupply,          // value = 0 (no prints)
  ]);
}

// ── Mint authority keypair ────────────────────────────────────────────────────

let cachedAuthority: Keypair | null = null;

function getMintAuthority(): Keypair {
  if (cachedAuthority) return cachedAuthority;

  const secretKey = env.MINT_AUTHORITY_SECRET_KEY;
  if (!secretKey) throw new Error('MINT_AUTHORITY_SECRET_KEY is not configured');

  const bytes = secretKey.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(secretKey))
    : bs58.decode(secretKey);

  cachedAuthority = Keypair.fromSecretKey(bytes);
  return cachedAuthority;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface BadgeClaimTx {
  /** Base64-encoded transaction — a simple SOL transfer (1 signer: user). */
  serializedTx: string;
  /** Placeholder — actual mint is created server-side after payment confirms. */
  mintPublicKey: string;
}


/**
 * Build a simple SOL-transfer payment transaction for claiming an NFT badge.
 *
 * The user's transaction is ONLY a SOL transfer to the treasury.
 * This makes the transaction fully simulatable by the Seeker / Seed Vault wallet
 * (1 signer, standard SystemProgram instructions → no "couldn't be simulated" warning).
 *
 * After the user's payment is confirmed, the server mints the NFT entirely server-side
 * via mintBadgeNft().
 */
export async function buildBadgeClaimTransaction(
  ownerWalletAddress: string,
  _badgeId: string,
  _seedSalt?: string,
): Promise<BadgeClaimTx> {
  const owner = new PublicKey(ownerWalletAddress);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const instructions: TransactionInstruction[] = [];

  // Compute budget for priority fee display in wallet
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }));
  instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));

  // Creator fee → treasury (the only real instruction)
  if (env.CREATOR_FEE_LAMPORTS > 0) {
    instructions.push(SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new PublicKey(env.TREASURY_WALLET),
      lamports: env.CREATOR_FEE_LAMPORTS,
    }));
  }

  // Build v0 VersionedTransaction — single signer (user), fully simulatable
  const messageV0 = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const vtx = new VersionedTransaction(messageV0);
  // No server signatures needed — user is the only signer

  const serialized = vtx.serialize();
  return {
    serializedTx: Buffer.from(serialized).toString('base64'),
    // Actual mint is generated server-side; this is a placeholder for API compat
    mintPublicKey: 'pending_server_mint',
  };
}

/**
 * Mint a badge NFT entirely server-side — create mint, ATA, token, metadata, master edition.
 *
 * Called by the /claim/confirm endpoint after verifying the user's SOL payment.
 * The authority keypair pays all rent + tx fees. Returns the new mint's public key.
 * Retries up to 3 times with a fresh blockhash on each attempt.
 */
export async function mintBadgeNft(
  ownerWallet: string,
  badgeId: string,
  seedSalt?: string,
): Promise<{ mintPublicKey: string; txSignature: string }> {
  const authority = getMintAuthority();
  const owner = new PublicKey(ownerWallet);
  const mintKeypair = Keypair.generate();

  // Creature metadata (deterministic from wallet + badgeId + seedSalt)
  const assets = await uploadCreatureAssets(ownerWallet, badgeId, seedSalt);
  const seed = creatureSeed(ownerWallet, badgeId, seedSalt);
  const creatureName = generateCreatureName(seed);

  const collectionMint = env.BADGE_COLLECTION_MINT
    ? new PublicKey(env.BADGE_COLLECTION_MINT)
    : undefined;

  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const ownerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, owner);
  const metadataPDA = findMetadataPDA(mintKeypair.publicKey);
  const masterEditionPDA = findMasterEditionPDA(mintKeypair.publicKey);

  // Retry up to 3 times — fetch a fresh blockhash each attempt to avoid "Blockhash not found"
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      const tx = new Transaction();
      tx.feePayer = authority.publicKey;
      tx.recentBlockhash = blockhash;

  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));

  // 1. Create mint account (authority pays rent)
  tx.add(SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }));

  // 2. Initialize mint (0 decimals, authority as mint authority + freeze authority)
  tx.add(createInitializeMintInstruction(
    mintKeypair.publicKey,
    0,
    authority.publicKey,
    authority.publicKey,
  ));

  // 3. Create owner's ATA (authority pays rent)
  tx.add(createAssociatedTokenAccountInstruction(
    authority.publicKey,
    ownerAta,
    owner,
    mintKeypair.publicKey,
  ));

  // 4. Mint exactly 1 token to the owner's ATA
  tx.add(createMintToInstruction(
    mintKeypair.publicKey,
    ownerAta,
    authority.publicKey,
    1,
  ));

  // 5. CreateMetadataAccountV3
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPDA,             isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,   isSigner: false, isWritable: false },
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: true  }, // payer
      { pubkey: authority.publicKey,     isSigner: false, isWritable: false }, // updateAuthority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
    ],
    data: encodeCreateMetadataAccountV3({
      name: creatureName,
      symbol: 'BURNSPIRIT',
      uri: assets.metadataUrl,
      sellerFeeBasisPoints: 0,
      isMutable: true,
      collectionMint,
    }),
  }));

  // 6. CreateMasterEditionV3
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: masterEditionPDA,        isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,    isSigner: false, isWritable: true  },
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // updateAuthority
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: true  }, // payer
      { pubkey: metadataPDA,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
    ],
    data: encodeCreateMasterEditionV3(),
  }));

  tx.sign(authority, mintKeypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      return {
        mintPublicKey: mintKeypair.publicKey.toBase58(),
        txSignature: sig,
      };
    } catch (err) {
      lastError = err;
      console.error(`[mintBadgeNft] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Verify collection membership for a freshly minted badge NFT.
 * Must be called server-side (fire-and-forget) AFTER the user's mint tx is confirmed.
 * The mint authority keypair pays the network fee for this instruction.
 *
 * This is intentionally NOT included in the user-signed transaction because
 * complex Metaplex multi-CPI instructions cause wallet simulation to fail.
 */
export async function verifyCollectionMembership(mintPublicKey: string): Promise<string | null> {
  if (!env.BADGE_COLLECTION_MINT) return null;
  try {
    const authority = getMintAuthority();
    const mint = new PublicKey(mintPublicKey);
    const collectionMint = new PublicKey(env.BADGE_COLLECTION_MINT);
    const metadataPDA = findMetadataPDA(mint);
    const collectionMetadataPDA = findMetadataPDA(collectionMint);
    const collectionMasterEditionPDA = findMasterEditionPDA(collectionMint);

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction();
    tx.feePayer = authority.publicKey;
    tx.recentBlockhash = blockhash;

    // SetAndVerifySizedCollectionItem (index 32) for sized collections,
    // or SetAndVerifyCollection (index 25) for unsized — sized is the default
    // when a collection is created with collectionDetails set.
    tx.add(new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: metadataPDA,                isSigner: false, isWritable: true  }, // NFT metadata
        { pubkey: authority.publicKey,        isSigner: true,  isWritable: true  }, // collection authority
        { pubkey: authority.publicKey,        isSigner: true,  isWritable: true  }, // payer
        { pubkey: authority.publicKey,        isSigner: false, isWritable: false }, // update authority of NFT
        { pubkey: collectionMint,             isSigner: false, isWritable: false }, // collection mint
        { pubkey: collectionMetadataPDA,      isSigner: false, isWritable: true  }, // collection metadata
        { pubkey: collectionMasterEditionPDA, isSigner: false, isWritable: false }, // collection master edition
      ],
      data: Buffer.from([32]), // SetAndVerifySizedCollectionItem
    }));

    tx.sign(authority);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    return sig;
  } catch (err) {
    console.error('[verifyCollectionMembership] non-fatal error:', err);
    return null;
  }
}

/**
 * Check if the mint authority is configured and funded.
 */
export async function checkMintAuthority(): Promise<{
  configured: boolean;
  publicKey?: string;
  solBalance?: number;
}> {
  try {
    const authority = getMintAuthority();
    const lamports = await connection.getBalance(authority.publicKey);
    return { configured: true, publicKey: authority.publicKey.toBase58(), solBalance: lamports / 1e9 };
  } catch {
    return { configured: false };
  }
}
