/**
 * NFT minting service for Seeker Burn Club badge NFTs.
 *
 * Uses only @solana/web3.js + internal SPL token helpers (no extra Metaplex dependencies).
 * Manually constructs Metaplex Token Metadata Program instructions via Borsh encoding.
 *
 * Single-transaction user-pays-all flow:
 * The server builds the complete mint transaction with the user as fee payer
 * (pays rent, tx fees, and creator fee). The server partially signs with the
 * mint authority and deterministic mint keypair. The user's wallet (MWA) adds
 * the final signature and broadcasts. The mint authority holds 0 SOL.
 *
 * Requires env vars:
 *   MINT_AUTHORITY_SECRET_KEY  — base58 or JSON-array of the authority keypair
 *   BACKEND_URL                — used to build the off-chain metadata URI
 */

import crypto from 'node:crypto';
import {
  Connection,
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

/** Dedicated connection for mint transactions — no short fetch timeout. */
const mintConnection = new Connection(env.SOLANA_RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 180_000,
});
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

/** Derive a deterministic Keypair from (wallet, badgeId, seedSalt). */
function deriveMintKeypair(ownerWallet: string, badgeId: string, seedSalt?: string): Keypair {
  const hash = crypto.createHash('sha256')
    .update(`${ownerWallet}:${badgeId}:${seedSalt ?? ''}`)
    .digest();
  return Keypair.fromSeed(hash.subarray(0, 32));
}

/**
 * Get the deterministic mint public key for a (wallet, badgeId, seedSalt) tuple.
 */
export function getDeterministicMintPublicKey(
  ownerWallet: string, badgeId: string, seedSalt?: string,
): string {
  return deriveMintKeypair(ownerWallet, badgeId, seedSalt).publicKey.toBase58();
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface BadgeClaimTx {
  /** Base64-encoded partially-signed VersionedTransaction (3 signers: user + authority + mint). */
  serializedTx: string;
  /** Deterministic mint address for this badge NFT. */
  mintPublicKey: string;
}


/**
 * Build the complete NFT mint transaction as a partially-signed VersionedTransaction.
 *
 * The USER is the fee payer — pays all rent, tx fees, and creator fee.
 * The SERVER partially signs with the mint authority + deterministic mint keypair.
 * The client (MWA) adds the user's signature and broadcasts the transaction.
 *
 * This eliminates the need for the mint authority to hold any SOL.
 */
export async function buildBadgeClaimTransaction(
  ownerWalletAddress: string,
  badgeId: string,
  seedSalt?: string,
): Promise<BadgeClaimTx> {
  const authority = getMintAuthority();
  const owner = new PublicKey(ownerWalletAddress);
  const mintKeypair = deriveMintKeypair(ownerWalletAddress, badgeId, seedSalt);

  // Parallel RPC calls + asset resolution
  const [mintRent, { blockhash }, assets] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    connection.getLatestBlockhash('confirmed'),
    uploadCreatureAssets(ownerWalletAddress, badgeId, seedSalt),
  ]);

  const seed = creatureSeed(ownerWalletAddress, badgeId, seedSalt);
  const creatureName = generateCreatureName(seed);
  const collectionMint = env.BADGE_COLLECTION_MINT
    ? new PublicKey(env.BADGE_COLLECTION_MINT)
    : undefined;
  const ownerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, owner);
  const metadataPDA = findMetadataPDA(mintKeypair.publicKey);
  const masterEditionPDA = findMasterEditionPDA(mintKeypair.publicKey);

  const instructions: TransactionInstruction[] = [];

  // Compute budget — enough for metadata + master edition creation
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }));

  // Creator fee → treasury
  if (env.CREATOR_FEE_LAMPORTS > 0) {
    instructions.push(SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new PublicKey(env.TREASURY_WALLET),
      lamports: env.CREATOR_FEE_LAMPORTS,
    }));
  }

  // Create mint account (user pays rent)
  instructions.push(SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: mintKeypair.publicKey,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }));

  // Initialize mint (0 decimals, authority as mint + freeze authority)
  instructions.push(createInitializeMintInstruction(
    mintKeypair.publicKey, 0, authority.publicKey, authority.publicKey,
  ));

  // Create owner's ATA (user pays rent)
  instructions.push(createAssociatedTokenAccountInstruction(
    owner, ownerAta, owner, mintKeypair.publicKey,
  ));

  // Mint 1 token to owner's ATA
  instructions.push(createMintToInstruction(
    mintKeypair.publicKey, ownerAta, authority.publicKey, 1,
  ));

  // CreateMetadataAccountV3 — user is payer, authority is mintAuth + updateAuth
  instructions.push(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPDA,             isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,   isSigner: false, isWritable: false },
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: owner,                   isSigner: true,  isWritable: true  }, // payer (USER)
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

  // CreateMasterEditionV3 — user is payer
  instructions.push(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: masterEditionPDA,        isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,    isSigner: false, isWritable: true  },
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // updateAuthority
      { pubkey: authority.publicKey,     isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: owner,                   isSigner: true,  isWritable: true  }, // payer (USER)
      { pubkey: metadataPDA,             isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
    ],
    data: encodeCreateMasterEditionV3(),
  }));

  // Compile to V0 message with user as fee payer
  const messageV0 = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const vtx = new VersionedTransaction(messageV0);
  // Server partially signs — MWA adds the user's signature (index 0)
  vtx.sign([authority, mintKeypair]);

  return {
    serializedTx: Buffer.from(vtx.serialize()).toString('base64'),
    mintPublicKey: mintKeypair.publicKey.toBase58(),
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

  // Deterministic mint keypair: same wallet+badge+salt always yields the same keypair.
  const mintKeypair = deriveMintKeypair(ownerWallet, badgeId, seedSalt);

  // ── Idempotency: if the deterministic mint already exists on-chain (prior
  //    attempt succeeded but confirmTransaction timed out), return immediately.
  //    This prevents false MINT_FAILED and duplicate createAccount errors.
  const existingAccount = await mintConnection.getAccountInfo(mintKeypair.publicKey).catch(() => null);
  if (existingAccount && existingAccount.owner.equals(TOKEN_PROGRAM_ID)) {
    console.log(`[mintBadgeNft] Deterministic mint ${mintKeypair.publicKey.toBase58()} already exists on-chain — returning existing`);
    return {
      mintPublicKey: mintKeypair.publicKey.toBase58(),
      txSignature: 'already_minted_on_chain',
    };
  }

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
      const { blockhash, lastValidBlockHeight } = await mintConnection.getLatestBlockhash('confirmed');

      const tx = new Transaction();
      tx.feePayer = authority.publicKey;
      tx.recentBlockhash = blockhash;

  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }));

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
      const sig = await mintConnection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 5,
      });
      await mintConnection.confirmTransaction(
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

      // After a failed confirm, check if the tx actually landed on-chain.
      // confirmTransaction can timeout even when the tx was processed.
      try {
        const postErrorAccount = await mintConnection.getAccountInfo(mintKeypair.publicKey);
        if (postErrorAccount && postErrorAccount.owner.equals(TOKEN_PROGRAM_ID)) {
          console.log(`[mintBadgeNft] Mint account exists on-chain despite error — treating as success`);
          return {
            mintPublicKey: mintKeypair.publicKey.toBase58(),
            txSignature: 'confirmed_after_timeout',
          };
        }
      } catch { /* RPC check failed — continue with retry */ }

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
 * Check if the deterministic mint for a (wallet, badgeId, seedSalt) tuple
 * already exists on-chain. Used by the stale-mint recovery job.
 * Returns the mint public key string if it exists, null otherwise.
 */
export async function checkDeterministicMintExists(
  ownerWallet: string,
  badgeId: string,
  seedSalt?: string,
): Promise<string | null> {
  const mintKeypair = deriveMintKeypair(ownerWallet, badgeId, seedSalt);
  try {
    const accountInfo = await connection.getAccountInfo(mintKeypair.publicKey);
    if (accountInfo && accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      return mintKeypair.publicKey.toBase58();
    }
  } catch { /* RPC error — treat as non-existent */ }
  return null;
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
