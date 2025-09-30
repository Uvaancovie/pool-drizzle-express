-- Add phone to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;

-- Create addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id serial primary key,
  user_id integer,
  type text not null, -- 'shipping' or 'billing'
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text,
  postal_code text not null,
  country text not null default 'South Africa',
  created_at timestamptz default now()
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id serial primary key,
  order_id integer not null,
  product_id integer not null,
  product_variant_id integer,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  total_price_cents integer not null,
  product_title text not null,
  product_slug text not null,
  created_at timestamptz default now()
);

-- Create order_delivery table
CREATE TABLE IF NOT EXISTS order_delivery (
  id serial primary key,
  order_id integer not null,
  delivery_method text not null, -- 'pickup' or 'shipping'
  pickup_date timestamptz,
  pickup_time text,
  shipping_address_id integer,
  tracking_number text,
  delivery_status text not null default 'pending', -- 'pending', 'shipped', 'delivered', 'picked_up'
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_order_id ON order_delivery(order_id);