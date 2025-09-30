-- Add missing columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_id integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address_id integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'ozow';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_ref text;