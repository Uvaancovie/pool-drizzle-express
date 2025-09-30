-- Update order_items table to match current schema
-- Add missing columns and rename existing ones

-- Add new columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price_cents integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_title text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_slug text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Rename existing columns to match schema
ALTER TABLE order_items RENAME COLUMN name_snapshot TO product_title_old;
ALTER TABLE order_items RENAME COLUMN qty TO quantity_old;

-- Update data: copy values from old columns to new ones where possible
UPDATE order_items SET product_title = product_title_old WHERE product_title IS NULL;
UPDATE order_items SET quantity = quantity_old WHERE quantity IS NULL;
UPDATE order_items SET total_price_cents = unit_price_cents * quantity WHERE total_price_cents IS NULL;

-- Drop old columns
ALTER TABLE order_items DROP COLUMN IF EXISTS product_title_old;
ALTER TABLE order_items DROP COLUMN IF EXISTS quantity_old;

-- Make required columns NOT NULL (after populating data)
ALTER TABLE order_items ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN total_price_cents SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN product_title SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN product_slug SET NOT NULL;