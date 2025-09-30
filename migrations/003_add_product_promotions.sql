-- Add promotion fields to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_promotional boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS promotion_text text,
ADD COLUMN IF NOT EXISTS promotion_discount_percent integer;

-- Add check constraint for discount percent (0-100)
ALTER TABLE products
ADD CONSTRAINT chk_promotion_discount_percent
CHECK (promotion_discount_percent IS NULL OR (promotion_discount_percent >= 0 AND promotion_discount_percent <= 100));