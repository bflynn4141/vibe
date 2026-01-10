/**
 * Run database migration
 * Usage: node scripts/run-migration.js migrations/004_artifacts.sql
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseSQLStatements(sql) {
  // Remove comment lines
  const lines = sql.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('--');
  });

  const cleaned = lines.join('\n');

  // Split on semicolons and filter
  return cleaned
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function runMigration(sqlFile) {
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not set');
    process.exit(1);
  }

  const sql = neon(process.env.POSTGRES_URL);

  try {
    console.log(`📂 Reading migration: ${sqlFile}`);
    const migrationPath = join(__dirname, '..', sqlFile);
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    const statements = parseSQLStatements(migrationSQL);

    console.log(`🚀 Running ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] ${preview}...`);

      try {
        await sql(statement);
      } catch (err) {
        console.error(`\n❌ Failed at statement ${i + 1}:`);
        console.error(statement.substring(0, 200));
        throw err;
      }
    }

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-migration.js migrations/004_artifacts.sql');
  process.exit(1);
}

runMigration(sqlFile);
