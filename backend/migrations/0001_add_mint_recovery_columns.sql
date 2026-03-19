-- Migration: Add columns for NFT mint reliability & recovery
-- Required before deploying the mint-recovery scheduler job.

ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_started_at TIMESTAMPTZ;
ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_failure_reason TEXT;
