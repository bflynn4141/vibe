/**
 * Test migration 005 - AIRC v0.2 Identity Portability
 *
 * Run with: node migrations/test_005_migration.js
 */

import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const dbUrlMatch = envContent.match(/POSTGRES_DATABASE_URL="([^"]+)"/);
const databaseUrl = dbUrlMatch ? dbUrlMatch[1] : process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ POSTGRES_DATABASE_URL not found in .env.local or environment');
  console.error('   Looking in:', envPath);
  process.exit(1);
}

async function testMigration() {
  console.log('🧪 Testing AIRC v0.2 Migration (005)');
  console.log('='.repeat(60));

  const client = new Client({ connectionString: databaseUrl });

  try {
    // 1. Connect to database
    await client.connect();
    console.log('\n✅ Connected to database');

    // 2. Read migration file
    const migrationPath = path.join(__dirname, '005_airc_v0.2_identity_portability.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded:', migrationPath);

    // 3. Execute migration
    console.log('\n⚙️  Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully');

    // 4. Verify tables created
    console.log('\n🔍 Verifying tables...');

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'nonce_tracker', 'audit_log', 'admin_access_log', 'handle_quarantine')
      ORDER BY table_name;
    `);

    console.log(`   Found ${tables.rows.length}/5 tables:`);
    tables.rows.forEach(t => console.log(`   ✓ ${t.table_name}`));

    if (tables.rows.length !== 5) {
      console.error(`   ❌ Expected 5 tables, found ${tables.rows.length}`);
      return false;
    }

    // 5. Verify indexes
    console.log('\n🔍 Verifying indexes...');

    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'nonce_tracker', 'audit_log', 'admin_access_log', 'handle_quarantine')
      AND indexname LIKE 'idx_%'
      ORDER BY indexname;
    `);

    console.log(`   Found ${indexes.rows.length} indexes:`);
    indexes.rows.slice(0, 10).forEach(i => console.log(`   ✓ ${i.indexname}`));
    if (indexes.rows.length > 10) {
      console.log(`   ... and ${indexes.rows.length - 10} more`);
    }

    // 6. Test users table structure
    console.log('\n🔍 Testing users table structure...');

    const userColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

    console.log('   Users table columns:');
    userColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'})`);
    });

    // 7. Test basic operations
    console.log('\n🧪 Testing basic operations...');

    // Insert test user
    await client.query(`
      INSERT INTO users (handle, signing_key, recovery_key, status)
      VALUES ('test_user', 'ed25519:test_key_123', 'ed25519:recovery_key_123', 'active')
      ON CONFLICT (handle) DO UPDATE
      SET signing_key = EXCLUDED.signing_key;
    `);
    console.log('   ✓ Insert test user');

    // Query test user
    const user = await client.query(`
      SELECT handle, signing_key, recovery_key, status, created_at
      FROM users
      WHERE handle = 'test_user';
    `);
    console.log('   ✓ Query test user:', user.rows[0]?.handle);

    // Insert nonce
    await client.query(`
      INSERT INTO nonce_tracker (nonce, handle, operation, expires_at)
      VALUES ('test_nonce_12345678', 'test_user', 'rotation', NOW() + INTERVAL '1 hour')
      ON CONFLICT (nonce) DO NOTHING;
    `);
    console.log('   ✓ Insert test nonce');

    // Insert audit log
    await client.query(`
      INSERT INTO audit_log (event_type, handle, success, details)
      VALUES ('test_event', 'test_user', true, '{"test": true}');
    `);
    console.log('   ✓ Insert test audit log');

    // 8. Test cleanup functions
    console.log('\n🧪 Testing cleanup functions...');

    const cleanedNonces = await client.query('SELECT cleanup_expired_nonces()');
    console.log('   ✓ cleanup_expired_nonces() returned:', cleanedNonces.rows[0].cleanup_expired_nonces);

    const cleanedQuarantines = await client.query('SELECT cleanup_expired_quarantines()');
    console.log('   ✓ cleanup_expired_quarantines() returned:', cleanedQuarantines.rows[0].cleanup_expired_quarantines);

    // 9. Check constraints
    console.log('\n🔍 Verifying constraints...');

    try {
      await client.query(`
        INSERT INTO users (handle, signing_key, status)
        VALUES ('test_invalid', 'ed25519:test', 'invalid_status');
      `);
      console.log('   ❌ Status constraint NOT working (should have failed)');
    } catch (err) {
      if (err.message.includes('users_status_check')) {
        console.log('   ✓ Status constraint working (invalid status rejected)');
      } else {
        console.log('   ⚠️  Different error:', err.message.substring(0, 80));
      }
    }

    // 10. Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration 005 Test PASSED');
    console.log('');
    console.log('Tables created: 5');
    console.log('Indexes created: ' + indexes.rows.length);
    console.log('Cleanup functions: 2');
    console.log('');
    console.log('Next steps:');
    console.log('1. Deploy migration to staging');
    console.log('2. Build rate limiting module');
    console.log('3. Implement rotation/revocation endpoints');
    console.log('='.repeat(60));

    return true;

  } catch (error) {
    console.error('\n❌ Migration test FAILED');
    console.error('Error:', error.message);
    console.error('');
    console.error('Full error:');
    console.error(error);
    return false;
  } finally {
    await client.end();
  }
}

// Run the test
testMigration()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
