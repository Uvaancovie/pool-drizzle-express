// Simple migration runner: applies SQL files in ./migrations in alphabetical order
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const migrationsDir = path.join(__dirname, '..', 'migrations');
const migrationTable = 'migrations';

async function run() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('DATABASE_URL not set in env');
    process.exit(1);
  }

  const client = new Client({ connectionString: conn });
  await client.connect();

  // ensure migration table exists
  await client.query(`CREATE TABLE IF NOT EXISTS ${migrationTable} (id serial primary key, name text not null unique, run_at timestamptz default now());`);

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const name = file;
    const res = await client.query(`SELECT 1 FROM ${migrationTable} WHERE name = $1`, [name]);
    if (res.rowCount > 0) {
      console.log('skipping', name);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log('applying', name);
    await client.query(sql);
    await client.query(`INSERT INTO ${migrationTable}(name) VALUES($1)`, [name]);
  }

  await client.end();
  console.log('migrations complete');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
