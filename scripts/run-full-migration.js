import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse SQL respecting dollar-quoted strings
function splitStatements(sqlText) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sqlText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comment-only lines outside dollar quotes
    if (trimmed.startsWith('--') && !inDollarQuote) continue;

    current += line + '\n';

    // Check for dollar quote start/end
    const dollarMatches = line.matchAll(/\$([a-zA-Z_]*)\$/g);
    for (const match of dollarMatches) {
      const tag = match[0];
      if (!inDollarQuote) {
        inDollarQuote = true;
        dollarTag = tag;
      } else if (tag === dollarTag) {
        inDollarQuote = false;
        dollarTag = '';
      }
    }

    // If not in dollar quote and line ends with semicolon, split
    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 1) statements.push(stmt);
      current = '';
    }
  }

  if (current.trim().length > 1) {
    statements.push(current.trim());
  }

  return statements;
}

async function run() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set');
    process.exit(1);
  }

  const sql = neon(process.env.POSTGRES_URL);
  const migrationPath = join(__dirname, '..', process.argv[2]);
  const migration = readFileSync(migrationPath, 'utf-8');

  try {
    console.log('Parsing migration file...');
    const statements = splitStatements(migration);
    console.log('Found ' + statements.length + ' statements');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\s+/g, ' ');
      process.stdout.write('[' + (i + 1) + '/' + statements.length + '] ' + preview + '...\n');
      await sql(stmt);
    }

    console.log('Migration completed successfully');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/run-full-migration.js migrations/006_social_graph.sql');
  process.exit(1);
}

run();
