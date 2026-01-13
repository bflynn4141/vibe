#!/usr/bin/env node
/**
 * E2E Test: Message Signing & Replay Prevention
 *
 * Tests AIRC v0.2.1 message security features:
 * 1. Unsigned message during grace period (should work with warning)
 * 2. Signed message (should work)
 * 3. Replay attack - same nonce (should fail)
 * 4. Invalid signature (should fail)
 * 5. Expired timestamp (should fail)
 *
 * Run: node migrations/e2e_message_signing_test.js [--verbose]
 */

import crypto from 'crypto';

const BASE_URL = process.env.BASE_URL || 'https://www.slashvibe.dev';
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(msg) {
  console.log(msg);
}

function logVerbose(msg) {
  if (VERBOSE) console.log(`  ${msg}`);
}

// ============================================================
// Crypto Utilities
// ============================================================

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  const publicKeyRaw = publicKey.slice(-32);
  return {
    publicKey: 'ed25519:' + publicKeyRaw.toString('base64'),
    privateKey,
    publicKeyRaw
  };
}

function canonicalJSON(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  });
}

function sign(data, privateKeyDer) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });
  const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
  return crypto.sign(null, dataBuffer, privateKey).toString('base64');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function createSignedMessage(from, to, text, privateKey) {
  const message = {
    from,
    to,
    text,
    timestamp: new Date().toISOString(),
    nonce: generateNonce()
  };

  const canonical = canonicalJSON(message);
  message.signature = sign(canonical, privateKey);

  return message;
}

// ============================================================
// HTTP Helpers
// ============================================================

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    json
  };
}

// ============================================================
// Test Cases
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       E2E Test: Message Signing & Replay Prevention          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Target: ${BASE_URL}`);
  console.log();

  // Generate keys for test users
  const signingKey = generateKeyPair();
  const testSender = `e2e_sender_${Date.now().toString(36).slice(-5)}`;
  const testRecipient = `e2e_recip_${Date.now().toString(36).slice(-5)}`;

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // --------------------------------------------------------
  // Step 1: Register sender with public key
  // --------------------------------------------------------
  log('\n[Step 1] Register sender with public key...');

  const registerResult = await fetchJSON(`${BASE_URL}/api/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: testSender,
      building: 'E2E message signing test',
      publicKey: signingKey.publicKey,
      recoveryKey: generateKeyPair().publicKey
    })
  });

  if (registerResult.status !== 200) {
    log(`  ❌ FAILED: Registration failed with status ${registerResult.status}`);
    log(`     Response: ${JSON.stringify(registerResult.json)}`);
    process.exit(1);
  }

  log(`  ✅ Sender @${testSender} registered with public key`);
  logVerbose(`Public key: ${signingKey.publicKey.slice(0, 40)}...`);

  // --------------------------------------------------------
  // Test 2: Unsigned message (grace period test)
  // --------------------------------------------------------
  log('\n[Test 2] Send unsigned message (grace period)...');

  const unsignedResult = await fetchJSON(`${BASE_URL}/api/messages`, {
    method: 'POST',
    body: JSON.stringify({
      from: testSender,
      to: testRecipient,
      text: 'Unsigned test message'
    })
  });

  logVerbose(`Status: ${unsignedResult.status}`);
  logVerbose(`Headers: ${JSON.stringify(unsignedResult.headers)}`);
  logVerbose(`Response: ${JSON.stringify(unsignedResult.json)}`);

  if (unsignedResult.status === 200) {
    if (unsignedResult.json.warning) {
      log(`  ✅ Accepted with deprecation warning (grace period active)`);
      log(`     Warning: ${unsignedResult.json.warning}`);
      if (unsignedResult.json.grace_period_ends) {
        log(`     Grace period ends: ${unsignedResult.json.grace_period_ends}`);
      }
      results.passed++;
      results.tests.push({ name: 'Unsigned (grace) + warning', status: 'pass' });
    } else {
      log(`  ❌ Accepted WITHOUT warning - spec requires warning during grace period`);
      results.failed++;
      results.tests.push({ name: 'Unsigned (grace) missing warning', status: 'fail' });
    }
  } else if (unsignedResult.status === 401 && unsignedResult.json.error === 'signature_required') {
    log(`  ⚠️  Rejected - strict mode is active (AIRC_STRICT_MODE=true or grace period ended)`);
    results.passed++;
    results.tests.push({ name: 'Unsigned (strict)', status: 'pass' });
  } else {
    log(`  ❌ Unexpected response: ${unsignedResult.status}`);
    results.failed++;
    results.tests.push({ name: 'Unsigned', status: 'fail' });
  }

  // --------------------------------------------------------
  // Test 3: Signed message
  // --------------------------------------------------------
  log('\n[Test 3] Send signed message...');

  const signedMessage = createSignedMessage(
    testSender,
    testRecipient,
    'This is a signed test message',
    signingKey.privateKey
  );

  logVerbose(`Nonce: ${signedMessage.nonce}`);
  logVerbose(`Timestamp: ${signedMessage.timestamp}`);

  const signedResult = await fetchJSON(`${BASE_URL}/api/messages`, {
    method: 'POST',
    body: JSON.stringify(signedMessage)
  });

  logVerbose(`Status: ${signedResult.status}`);
  logVerbose(`Response: ${JSON.stringify(signedResult.json)}`);

  if (signedResult.status === 200 && signedResult.json.success) {
    log(`  ✅ Signed message accepted`);
    log(`     Message ID: ${signedResult.json.message?.id}`);
    results.passed++;
    results.tests.push({ name: 'Signed message', status: 'pass' });
  } else {
    log(`  ❌ Signed message rejected: ${signedResult.json.error}`);
    log(`     ${signedResult.json.message || JSON.stringify(signedResult.json)}`);
    results.failed++;
    results.tests.push({ name: 'Signed message', status: 'fail' });
  }

  // --------------------------------------------------------
  // Test 4: Replay attack (same nonce)
  // --------------------------------------------------------
  log('\n[Test 4] Replay attack - send same nonce...');

  // Send exact same signed message again
  const replayResult = await fetchJSON(`${BASE_URL}/api/messages`, {
    method: 'POST',
    body: JSON.stringify(signedMessage)  // Same nonce!
  });

  logVerbose(`Status: ${replayResult.status}`);
  logVerbose(`Response: ${JSON.stringify(replayResult.json)}`);

  if (replayResult.status === 401 && replayResult.json.error === 'replay_attack') {
    log(`  ✅ Replay attack correctly blocked!`);
    results.passed++;
    results.tests.push({ name: 'Replay prevention', status: 'pass' });
  } else if (replayResult.status === 200) {
    log(`  ❌ Replay attack NOT blocked - vulnerability!`);
    results.failed++;
    results.tests.push({ name: 'Replay prevention', status: 'fail' });
  } else {
    log(`  ⚠️  Unexpected response: ${replayResult.status} ${replayResult.json.error}`);
    results.tests.push({ name: 'Replay prevention', status: 'warn' });
  }

  // --------------------------------------------------------
  // Test 5: Invalid signature
  // --------------------------------------------------------
  log('\n[Test 5] Send message with invalid signature...');

  const badSignatureMessage = {
    ...createSignedMessage(testSender, testRecipient, 'Bad sig test', signingKey.privateKey),
    signature: 'INVALID_SIGNATURE_aGVsbG8gd29ybGQ='  // Garbage signature
  };

  const badSigResult = await fetchJSON(`${BASE_URL}/api/messages`, {
    method: 'POST',
    body: JSON.stringify(badSignatureMessage)
  });

  logVerbose(`Status: ${badSigResult.status}`);
  logVerbose(`Response: ${JSON.stringify(badSigResult.json)}`);

  if (badSigResult.status === 401 && badSigResult.json.error === 'invalid_signature') {
    log(`  ✅ Invalid signature correctly rejected!`);
    results.passed++;
    results.tests.push({ name: 'Invalid signature', status: 'pass' });
  } else if (badSigResult.status === 200) {
    log(`  ❌ Invalid signature NOT rejected - vulnerability!`);
    results.failed++;
    results.tests.push({ name: 'Invalid signature', status: 'fail' });
  } else {
    log(`  ⚠️  Unexpected response: ${badSigResult.status} ${badSigResult.json.error}`);
    log(`     ${badSigResult.json.message || ''}`);
    results.tests.push({ name: 'Invalid signature', status: 'warn' });
  }

  // --------------------------------------------------------
  // Test 6: Expired timestamp
  // --------------------------------------------------------
  log('\n[Test 6] Send message with expired timestamp...');

  const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();  // 10 minutes ago
  const expiredMessage = {
    from: testSender,
    to: testRecipient,
    text: 'Expired timestamp test',
    timestamp: oldTimestamp,
    nonce: generateNonce()
  };

  // Sign with the old timestamp
  const expiredCanonical = canonicalJSON(expiredMessage);
  expiredMessage.signature = sign(expiredCanonical, signingKey.privateKey);

  const expiredResult = await fetchJSON(`${BASE_URL}/api/messages`, {
    method: 'POST',
    body: JSON.stringify(expiredMessage)
  });

  logVerbose(`Status: ${expiredResult.status}`);
  logVerbose(`Response: ${JSON.stringify(expiredResult.json)}`);

  if (expiredResult.status === 401 && expiredResult.json.error === 'timestamp_expired') {
    log(`  ✅ Expired timestamp correctly rejected!`);
    results.passed++;
    results.tests.push({ name: 'Timestamp validation', status: 'pass' });
  } else if (expiredResult.status === 200) {
    log(`  ❌ Expired timestamp NOT rejected - vulnerability!`);
    results.failed++;
    results.tests.push({ name: 'Timestamp validation', status: 'fail' });
  } else {
    log(`  ⚠️  Response: ${expiredResult.status} ${expiredResult.json.error}`);
    results.tests.push({ name: 'Timestamp validation', status: 'warn' });
  }

  // --------------------------------------------------------
  // Summary
  // --------------------------------------------------------
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Test sender: @${testSender}`);
  console.log(`Tests passed: ${results.passed}`);
  console.log(`Tests failed: ${results.failed}`);
  console.log();
  console.log('Results:');
  results.tests.forEach(t => {
    const icon = t.status === 'pass' ? '✅' : t.status === 'fail' ? '❌' : '⚠️';
    console.log(`  ${icon} ${t.name}`);
  });
  console.log();

  if (results.failed > 0) {
    console.log('⚠️  Some tests failed - review security implementation');
    process.exit(1);
  } else {
    console.log('🎉 All security tests passed!');
  }
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
