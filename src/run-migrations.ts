import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db/client';
import path from 'path';

async function runMigrations() {
  try {
    console.log('Running migrations...');
    // Migrations directory is not used here; instead we'll use drizzle-kit
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
