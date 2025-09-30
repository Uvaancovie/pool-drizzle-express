import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import dotenv from 'dotenv';
import { orders, products, announcements, product_images, users, addresses, order_items, order_delivery, contacts } from './schema';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required in env');
}

const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema: { orders, products, announcements, product_images, users, addresses, order_items, order_delivery, contacts } });
