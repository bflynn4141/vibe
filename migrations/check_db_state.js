/**
 * Check current database state before migration
 */

import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const dbUrlMatch = envContent.match(/POSTGRES_DATABASE_URL="([^"]+)"/);
const databaseUrl = dbUrlMatch[1];

async function checkDB() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check if users table exists
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('Existing tables:');
    tables.rows.forEach(t => console.log(`  - ${t.table_name}`));

    // If users table exists, show its structure
    if (tables.rows.some(t => t.table_name === 'users')) {
      console.log('\nUsers table structure:');
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
      });

      // Count rows
      const count = await client.query('SELECT COUNT(*) FROM users');
      console.log(`\nUsers count: ${count.rows[0].count}`);
    }

  } finally {
    await client.end();
  }
}

checkDB().catch(console.error);
