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

async function testMigration() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('🧪 Testing Final AIRC v0.2 Migration\n');

    // Execute migration
    const migrationPath = path.join(__dirname, '005_airc_v0.2_final.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('⚙️  Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration executed\n');

    // Verify
    console.log('🔍 Verifying changes...');

    // Check success column
    const successCol = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'audit_log' AND column_name = 'success';
    `);
    console.log(successCol.rows.length > 0 ? '  ✓ audit_log.success column' : '  ❌ Missing success column');

    // Check handle_quarantine table
    const quarantine = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'handle_quarantine';
    `);
    console.log(quarantine.rows.length > 0 ? '  ✓ handle_quarantine table' : '  ❌ Missing quarantine table');

    // Test operations
    console.log('\n🧪 Testing operations...');

    // Insert test audit with success field
    await client.query(`
      INSERT INTO audit_log (id, event_type, handle, success, details)
      VALUES ('test_audit_' || NOW()::text, 'test_event', 'test_user', false, '{"error": "test"}');
    `);
    console.log('  ✓ Insert audit log with success=false');

    // Insert test quarantine
    await client.query(`
      INSERT INTO handle_quarantine (handle, revoked_at, expires_at, reason)
      VALUES ('test_quarantine', NOW(), NOW() + INTERVAL '90 days', 'test')
      ON CONFLICT (handle) DO UPDATE SET reason = EXCLUDED.reason;
    `);
    console.log('  ✓ Insert quarantine record');

    // Test cleanup function
    const cleaned = await client.query('SELECT cleanup_expired_quarantines()');
    console.log('  ✓ cleanup_expired_quarantines() works');

    console.log('\n✅ AIRC v0.2 schema ready!');
    console.log('\nNext steps:');
    console.log('1. Build rate limiting module');
    console.log('2. Implement rotation endpoint');
    console.log('3. Implement revocation endpoint');

    return true;

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    return false;
  } finally {
    await client.end();
  }
}

testMigration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
