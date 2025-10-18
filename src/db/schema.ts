import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  boolean as pgBoolean,
  jsonb
} from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'),
  base_price_cents: integer('base_price_cents').notNull().default(0),
  is_promotional: pgBoolean('is_promotional').notNull().default(false),
  promotion_text: text('promotion_text'),
  promotion_discount_percent: integer('promotion_discount_percent'),
  seo_title: text('seo_title'),
  seo_description: text('seo_description'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow()
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  order_no: text('order_no').notNull(),
  user_id: integer('user_id'),
  email: text('email'),
  status: text('status').notNull().default('pending'),
  payment_status: text('payment_status').notNull().default('pending'),
  subtotal_cents: integer('subtotal_cents').notNull().default(0),
  shipping_cents: integer('shipping_cents').notNull().default(0),
  discount_cents: integer('discount_cents').notNull().default(0),
  tax_cents: integer('tax_cents').notNull().default(0),
  total_cents: integer('total_cents').notNull().default(0),
  shipping_address_id: integer('shipping_address_id'),
  billing_address_id: integer('billing_address_id'),
  gateway: text('gateway').notNull().default('ozow'),
  gateway_ref: text('gateway_ref'),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const product_variants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').notNull(),
  sku: text('sku').notNull(),
  options: jsonb('options').notNull(),
  stock: integer('stock').notNull().default(0),
  price_override_cents: integer('price_override_cents'),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const product_images = pgTable('product_images', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').notNull(),
  url: text('url').notNull(),
  alt: text('alt').notNull(),
  sort: integer('sort').notNull().default(0),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  body_richtext: text('body_richtext'),
  banner_image: text('banner_image'),
  published_at: timestamp('published_at'),
  start_at: timestamp('start_at'),
  end_at: timestamp('end_at'),
  is_featured: pgBoolean('is_featured').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull().default('customer'), // 'admin' or 'customer'
  first_name: text('first_name'),
  last_name: text('last_name'),
  phone: text('phone'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow()
});

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id'),
  type: text('type').notNull(), // 'shipping' or 'billing'
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  address_line_1: text('address_line_1').notNull(),
  address_line_2: text('address_line_2'),
  city: text('city').notNull(),
  state: text('state'),
  postal_code: text('postal_code').notNull(),
  country: text('country').notNull().default('South Africa'),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const order_items = pgTable('order_items', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull(),
  product_id: integer('product_id').notNull(),
  product_variant_id: integer('product_variant_id'),
  quantity: integer('quantity').notNull().default(1),
  unit_price_cents: integer('unit_price_cents').notNull(),
  total_price_cents: integer('total_price_cents').notNull(),
  product_title: text('product_title').notNull(),
  product_slug: text('product_slug').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow()
});

export const order_delivery = pgTable('order_delivery', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull(),
  delivery_method: text('delivery_method').notNull(), // 'pickup' or 'shipping'
  pickup_date: timestamp('pickup_date'),
  pickup_time: text('pickup_time'),
  shipping_address_id: integer('shipping_address_id'),
  tracking_number: text('tracking_number'),
  delivery_status: text('delivery_status').notNull().default('pending'), // 'pending', 'shipped', 'delivered', 'picked_up'
  notes: text('notes'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow()
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  message: text('message').notNull(),
  is_read: pgBoolean('is_read').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow()
});

