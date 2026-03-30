-- Add currency column to shield_purchases for SOL/SKR dual-currency support
ALTER TABLE shield_purchases
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'SOL';
