#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config();

async function setup() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: conn });
  
  try {
    await client.connect();
    console.log('Connected to database');

    // Drop existing tables to start fresh (WARNING: This deletes data!)
    console.log('Dropping existing tables...');
    await client.query(`
      DROP TABLE IF EXISTS product_variants CASCADE;
      DROP TABLE IF EXISTS product_collections CASCADE;
      DROP TABLE IF EXISTS collections CASCADE;
      DROP TABLE IF EXISTS product_tags CASCADE;
      DROP TABLE IF EXISTS tags CASCADE;
      DROP TABLE IF EXISTS product_images CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS addresses CASCADE;
      DROP TABLE IF EXISTS order_delivery CASCADE;
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS announcements CASCADE;
      DROP TABLE IF EXISTS contacts CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS migrations CASCADE;
    `);
    console.log('Tables dropped');

    // Create users table
    await client.query(`
      CREATE TABLE users (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'customer',
        first_name text,
        last_name text,
        phone text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ users table created');

    // Create products table
    await client.query(`
      CREATE TABLE products (
        id serial PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        title text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'draft',
        base_price_cents integer NOT NULL DEFAULT 0,
        is_promotional boolean DEFAULT false,
        promotion_text text,
        promotion_discount_percent integer,
        seo_title text,
        seo_description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ products table created');

    // Create product_images table
    await client.query(`
      CREATE TABLE product_images (
        id serial PRIMARY KEY,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        url text NOT NULL,
        alt text,
        sort integer DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ product_images table created');

    // Create announcements table
    await client.query(`
      CREATE TABLE announcements (
        id serial PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        title text NOT NULL,
        excerpt text,
        body_richtext text,
        banner_image text,
        published_at timestamptz,
        start_at timestamptz,
        end_at timestamptz,
        is_featured boolean DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ announcements table created');

    // Create addresses table
    await client.query(`
      CREATE TABLE addresses (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) ON DELETE SET NULL,
        address_line_1 text NOT NULL,
        address_line_2 text,
        city text NOT NULL,
        state text,
        postal_code text,
        country text NOT NULL DEFAULT 'South Africa',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ addresses table created');

    // Create orders table
    await client.query(`
      CREATE TABLE orders (
        id serial PRIMARY KEY,
        order_no text NOT NULL UNIQUE,
        user_id integer REFERENCES users(id) ON DELETE SET NULL,
        email text,
        status text NOT NULL DEFAULT 'pending',
        payment_status text NOT NULL DEFAULT 'pending',
        subtotal_cents integer DEFAULT 0,
        shipping_cents integer DEFAULT 0,
        discount_cents integer DEFAULT 0,
        tax_cents integer DEFAULT 0,
        total_cents integer NOT NULL,
        shipping_address_id integer REFERENCES addresses(id) ON DELETE SET NULL,
        billing_address_id integer REFERENCES addresses(id) ON DELETE SET NULL,
        gateway text,
        gateway_ref text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ orders table created');

    // Create order_items table
    await client.query(`
      CREATE TABLE order_items (
        id serial PRIMARY KEY,
        order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id integer REFERENCES products(id) ON DELETE SET NULL,
        product_title text,
        quantity integer NOT NULL,
        total_price_cents integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ order_items table created');

    // Create order_delivery table
    await client.query(`
      CREATE TABLE order_delivery (
        id serial PRIMARY KEY,
        order_id integer NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        delivery_method text NOT NULL,
        pickup_date date,
        pickup_time time,
        shipping_address_id integer REFERENCES addresses(id),
        delivery_status text DEFAULT 'pending',
        tracking_number text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ order_delivery table created');

    // Create contacts table
    await client.query(`
      CREATE TABLE contacts (
        id serial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        phone text,
        message text NOT NULL,
        is_read boolean DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log('✓ contacts table created');

    console.log('\n✅ Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setup();
