-- Create orders table (minimal)
CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  email text,
  status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'pending',
  total_cents integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
