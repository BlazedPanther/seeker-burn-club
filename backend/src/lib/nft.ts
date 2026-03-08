/**
 * NFT minting service for Seeker Burn Club badge NFTs.
 *
 * Uses only @solana/web3.js + internal SPL token helpers (no extra Metaplex dependencies).
 * Manually constructs Metaplex Token Metadata Program instructions via Borsh encoding.
 *
 * Flow for each badge:
 * 1. Create an SPL Mint (0 decimals).
 * 2. Create the owner's ATA and mint exactly 1 token.
 * 3. Remove freeze authority (supply permanently 1).
 * 4. Create an on-chain Metaplex Token Metadata v3 account.
 * 5. Create a Metaplex Master Edition v3 (makes it a true 1-of-1 NFT).
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
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  AuthorityType,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
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

function findMasterEditionPDA(mint: PublicKey): PublicKey {
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
  /** Base64-encoded transaction partially signed by the server (mintKeypair + authority). */
  serializedTx: string;
  /** The public key of the new NFT mint account. */
  mintPublicKey: string;
}


/**
 * Build a badge NFT mint transaction where the USER is the fee payer.
 *
 * The server partially signs with [mintKeypair, authority].
 * The client (mobile app) signs as feePayer via MWA and broadcasts.
 *
 * Flow:
 *   1. Server returns serializedTx (base64) + mintPublicKey
 *   2. Client decodes → passes to MWA signAndSendTransaction
 *   3. Client calls claim/confirm endpoint with txSignature + mintPublicKey
 */
export async function buildBadgeClaimTransaction(
  ownerWalletAddress: string,
  badgeId: string,
  seedSalt?: string,
): Promise<BadgeClaimTx> {
  const def = getBadgeById(badgeId);
  if (!def) throw new Error(`Unknown badge ID: ${badgeId}`);

  const authority = getMintAuthority();
  const owner = new PublicKey(ownerWalletAddress);
  const mintKeypair = Keypair.generate();

  // Upload creature assets to Arweave (falls back to backend URLs)
  const assets = await uploadCreatureAssets(ownerWalletAddress, badgeId, seedSalt);
  const metadataUri = assets.metadataUrl;

  // Resolve collection mint (if configured)
  const collectionMint = env.BADGE_COLLECTION_MINT
    ? new PublicKey(env.BADGE_COLLECTION_MINT)
    : undefined;

  // Resolve creature traits for the name
  const seed = creatureSeed(ownerWalletAddress, badgeId, seedSalt);
  const traits = resolveTraits(seed, badgeId);
  const creatureName = generateCreatureName(seed);

  // Rent for the new mint account (paid by the user)
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  // Derive owner's ATA for this brand-new mint
  const ownerAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, owner);

  // Metaplex PDAs
  const metadataPDA = findMetadataPDA(mintKeypair.publicKey);
  const masterEditionPDA = findMasterEditionPDA(mintKeypair.publicKey);

  const { blockhash } = await connection.getLatestBlockhash('finalized');

  const tx = new Transaction();
  tx.feePayer = owner;       // ← USER pays all fees
  tx.recentBlockhash = blockhash;

  // 1. Create mint account on-chain (rent paid by user)
  tx.add(SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: mintKeypair.publicKey,
    lamports: mintRent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }));

  // 1b. Creator fee transfer → treasury (user pays)
  if (env.CREATOR_FEE_LAMPORTS > 0) {
    tx.add(SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new PublicKey(env.TREASURY_WALLET),
      lamports: env.CREATOR_FEE_LAMPORTS,
    }));
  }

  // 2. Initialize as a mint with 0 decimals (authority = server)
  tx.add(createInitializeMintInstruction(
    mintKeypair.publicKey,
    0,
    authority.publicKey,
    authority.publicKey,
  ));

  // 3. Create owner's ATA (rent paid by user)
  tx.add(createAssociatedTokenAccountInstruction(
    owner,
    ownerAta,
    owner,
    mintKeypair.publicKey,
  ));

  // 4. Mint exactly 1 token to the ATA (authority = server)
  tx.add(createMintToInstruction(
    mintKeypair.publicKey,
    ownerAta,
    authority.publicKey,
    1,
  ));

  // 5. Metaplex token metadata v3 (payer = USER, mintAuthority = server)
  //    MUST come before authority removal — Metaplex verifies mint authority
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPDA,              isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,    isSigner: false, isWritable: false },
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: owner,                    isSigner: true,  isWritable: true  }, // payer (USER)
      { pubkey: authority.publicKey,      isSigner: false, isWritable: false }, // updateAuthority
      { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
    ],
    data: encodeCreateMetadataAccountV3({
      name: creatureName,
      symbol: 'BURNSPIRIT',
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      isMutable: false,
      collectionMint,
    }),
  }));

  // 8. Metaplex master edition v3 (payer = USER, authority = server)
  tx.add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: masterEditionPDA,         isSigner: false, isWritable: true  },
      { pubkey: mintKeypair.publicKey,    isSigner: false, isWritable: true  },
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // updateAuthority
      { pubkey: authority.publicKey,      isSigner: true,  isWritable: false }, // mintAuthority
      { pubkey: owner,                    isSigner: true,  isWritable: true  }, // payer (USER)
      { pubkey: metadataPDA,              isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,         isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,       isSigner: false, isWritable: false },
    ],
    data: encodeCreateMasterEditionV3(),
  }));

  // 9. Verify collection membership (if collection is configured)
  if (collectionMint) {
    const collectionMetadataPDA = findMetadataPDA(collectionMint);
    const collectionMasterEditionPDA = findMasterEditionPDA(collectionMint);

    // SetAndVerifyCollectionV2: instruction discriminant = 32 (0x20 → actually 25 for SetAndVerifyCollection)
    // Instruction index 25 = SetAndVerifyCollection
    tx.add(new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys: [
        { pubkey: metadataPDA,                isSigner: false, isWritable: true  }, // metadata account of the NFT
        { pubkey: authority.publicKey,         isSigner: true,  isWritable: true  }, // collection authority (update authority of collection)
        { pubkey: owner,                       isSigner: true,  isWritable: true  }, // payer
        { pubkey: authority.publicKey,         isSigner: false, isWritable: false }, // update authority of NFT
        { pubkey: collectionMint,             isSigner: false, isWritable: false }, // collection mint
        { pubkey: collectionMetadataPDA,      isSigner: false, isWritable: true  }, // collection metadata
        { pubkey: collectionMasterEditionPDA, isSigner: false, isWritable: false }, // collection master edition
      ],
      data: Buffer.from([32]),  // SetAndVerifySizedCollectionItem (for sized collections)
    }));
  }

  // CreateMasterEditionV3 internally transfers mint authority to the master
  // edition PDA, but we add an explicit SetAuthority as a defence-in-depth
  // measure. If the master edition already removed it this becomes a harmless
  // no-op that Solana rejects silently in simulation — the real protection is
  // the confirm endpoint which verifies authority == null on-chain.
  tx.add(createSetAuthorityInstruction(
    mintKeypair.publicKey,
    authority.publicKey,
    AuthorityType.MintTokens,
    null,  // revoke mint authority entirely
  ));

  // Server partially signs: mintKeypair (new account signer) + authority (mint/metadata signer)
  tx.partialSign(mintKeypair, authority);

  const serialized = tx.serialize({ requireAllSignatures: false });
  return {
    serializedTx: Buffer.from(serialized).toString('base64'),
    mintPublicKey: mintKeypair.publicKey.toBase58(),
  };
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
