-- Full schema for Pool Beanbags MVP
-- 1) Products
CREATE TABLE IF NOT EXISTS products (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  base_price_cents integer NOT NULL DEFAULT 0,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Product variants
CREATE TABLE IF NOT EXISTS product_variants (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  options jsonb NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  price_override_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- GIN index for options
CREATE INDEX IF NOT EXISTS idx_product_variants_options_gin ON product_variants USING gin (options);

-- 3) Product images (max 3 per product enforced by trigger)
CREATE TABLE IF NOT EXISTS product_images (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger function to prevent more than 3 images per product
CREATE OR REPLACE FUNCTION check_product_images_limit() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF ((SELECT COUNT(*) FROM product_images WHERE product_id = NEW.product_id) + 1) > 3 THEN
      RAISE EXCEPTION 'A product may have at most 3 images';
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF ((SELECT COUNT(*) FROM product_images WHERE product_id = NEW.product_id AND id <> COALESCE(NEW.id, 0)) + 1) > 3 THEN
      RAISE EXCEPTION 'A product may have at most 3 images';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_product_images_limit ON product_images;
CREATE TRIGGER trg_check_product_images_limit
  BEFORE INSERT OR UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION check_product_images_limit();

-- 4) Collections & linking
CREATE TABLE IF NOT EXISTS collections (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL
);

CREATE TABLE IF NOT EXISTS product_collections (
  product_id integer REFERENCES products(id) ON DELETE CASCADE,
  collection_id integer REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, collection_id)
);

-- 5) Tags & linking
CREATE TABLE IF NOT EXISTS tags (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id integer REFERENCES products(id) ON DELETE CASCADE,
  tag_id integer REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

-- 6) Addresses
CREATE TABLE IF NOT EXISTS addresses (
  id serial PRIMARY KEY,
  user_id integer,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  address1 text NOT NULL,
  address2 text,
  suburb text,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'ZA'
);
-- enforce ZA postal code 4 digits and allowed provinces
ALTER TABLE addresses
  ADD CONSTRAINT chk_postal_code_format CHECK (postal_code ~ '^\\d{4}$')
  ;

-- 7) Orders
CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  user_id integer,
  email text,
  status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'pending',
  subtotal_cents integer NOT NULL DEFAULT 0,
  shipping_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  shipping_address_id integer REFERENCES addresses(id),
  billing_address_id integer REFERENCES addresses(id),
  gateway text NOT NULL DEFAULT 'ozow',
  gateway_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8) Order items
CREATE TABLE IF NOT EXISTS order_items (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id integer REFERENCES product_variants(id),
  name_snapshot text NOT NULL,
  unit_price_cents integer NOT NULL,
  qty integer NOT NULL DEFAULT 1
);

-- 9) Shipping rates
CREATE TABLE IF NOT EXISTS shipping_rates (
  id serial PRIMARY KEY,
  province text NOT NULL,
  min_weight_kg numeric NOT NULL DEFAULT 0,
  max_weight_kg numeric NOT NULL DEFAULT 9999,
  rate_cents integer NOT NULL DEFAULT 0
);

-- 10) Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  body_richtext text,
  banner_image text,
  published_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  is_featured boolean NOT NULL DEFAULT false
);

-- 11) Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id serial PRIMARY KEY,
  order_id integer NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  invoice_no text NOT NULL UNIQUE,
  pdf_url text,
  issued_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- End of full schema
