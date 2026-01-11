/**
 * Verify existing schema is compatible with AIRC v0.2
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

async function verifySchema() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('🔍 Verifying AIRC v0.2 Schema Compatibility\n');
    console.log('='.repeat(60));

    const checks = [];

    // 1. Check users table has required columns
    console.log('\n✓ Checking users table...');
    const userColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users';
    `);

    const userCols = userColumns.rows.map(r => r.column_name);
    const requiredUserCols = ['username', 'public_key', 'recovery_key', 'registry', 'key_rotated_at', 'revoked_at', 'status'];

    requiredUserCols.forEach(col => {
      const exists = userCols.includes(col);
      console.log(`  ${exists ? '✓' : '❌'} ${col}`);
      checks.push({ name: `users.${col}`, passed: exists });
    });

    // 2. Check nonce_tracker table
    console.log('\n✓ Checking nonce_tracker table...');
    const nonceCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'nonce_tracker';
    `);

    const nonceCols = nonceCheck.rows.map(r => r.column_name);
    const requiredNonceCols = ['nonce', 'handle', 'operation', 'expires_at'];

    requiredNonceCols.forEach(col => {
      const exists = nonceCols.includes(col);
      console.log(`  ${exists ? '✓' : '❌'} ${col}`);
      checks.push({ name: `nonce_tracker.${col}`, passed: exists });
    });

    // 3. Check audit_log table
    console.log('\n✓ Checking audit_log table...');
    const auditCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'audit_log';
    `);

    const auditCols = auditCheck.rows.map(r => r.column_name);
    const requiredAuditCols = ['event_type', 'handle', 'success', 'details'];

    requiredAuditCols.forEach(col => {
      const exists = auditCols.includes(col);
      console.log(`  ${exists ? '✓' : '❌'} ${col}`);
      checks.push({ name: `audit_log.${col}`, passed: exists });
    });

    // 4. Check handle_quarantine table
    console.log('\n✓ Checking handle_quarantine table...');
    const quarantineCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'handle_quarantine';
    `);

    const quarantineExists = quarantineCheck.rows.length > 0;
    console.log(`  ${quarantineExists ? '✓' : '⚠️ '} handle_quarantine table ${quarantineExists ? 'exists' : 'MISSING'}`);
    checks.push({ name: 'handle_quarantine table', passed: quarantineExists });

    // 5. Test data operations
    console.log('\n✓ Testing AIRC v0.2 operations...');

    // Test insert with AIRC v0.2 fields
    await client.query(`
      INSERT INTO users (username, public_key, recovery_key, status)
      VALUES ('test_airc', 'ed25519:test_pk', 'ed25519:test_rk', 'active')
      ON CONFLICT (username) DO UPDATE
      SET public_key = EXCLUDED.public_key;
    `);
    console.log('  ✓ Insert user with recovery_key');
    checks.push({ name: 'Insert AIRC user', passed: true });

    // Test nonce tracking
    await client.query(`
      INSERT INTO nonce_tracker (nonce, handle, operation, expires_at)
      VALUES ('test_nonce_verify', 'test_airc', 'rotation', NOW() + INTERVAL '1 hour')
      ON CONFLICT (nonce) DO NOTHING;
    `);
    console.log('  ✓ Insert nonce');
    checks.push({ name: 'Insert nonce', passed: true });

    // Test audit log
    await client.query(`
      INSERT INTO audit_log (event_type, handle, success, details)
      VALUES ('test_rotation', 'test_airc', true, '{"test": true}');
    `);
    console.log('  ✓ Insert audit log');
    checks.push({ name: 'Insert audit log', passed: true });

    // Summary
    console.log('\n' + '='.repeat(60));
    const allPassed = checks.every(c => c.passed);

    if (allPassed) {
      console.log('✅ Schema is AIRC v0.2 compatible!');
      console.log('');
      console.log('Note: Existing schema uses:');
      console.log('  - username (instead of handle)');
      console.log('  - public_key (instead of signing_key)');
      console.log('');
      console.log('Implementation should use existing column names.');
    } else {
      console.log('❌ Schema has compatibility issues:');
      checks.filter(c => !c.passed).forEach(c => {
        console.log(`  - ${c.name}`);
      });
    }

    console.log('='.repeat(60));

    return allPassed;

  } catch (err) {
    console.error('Error:', err);
    return false;
  } finally {
    await client.end();
  }
}

verifySchema()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
