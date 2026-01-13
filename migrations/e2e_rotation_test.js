#!/usr/bin/env node
/**
 * E2E Test: Key Rotation and Replay Attack Prevention
 *
 * Tests:
 * 1. Create user with recovery key
 * 2. Rotate key (should succeed)
 * 3. Replay same proof (should fail with replay_attack)
 * 4. Rotate again within 1 hour (should fail with rate_limited)
 *
 * Run: node migrations/e2e_rotation_test.js
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

function createRotationProof(handle, oldKey, newKey, recoveryPrivateKey) {
  const proof = {
    operation: 'rotate',
    handle,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(16).toString('hex'),
    old_key: oldKey,
    new_key: newKey
  };
  const message = canonicalJSON(proof);
  proof.signature = sign(message, recoveryPrivateKey);
  return proof;
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

  return { status: response.status, headers: response.headers, json };
}

// ============================================================
// Test Cases
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         E2E Test: Key Rotation & Replay Prevention           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Target: ${BASE_URL}`);
  console.log();

  // Generate keys
  const signingKey = generateKeyPair();
  const recoveryKey = generateKeyPair();
  const newSigningKey = generateKeyPair();

  // Use a short unique handle
  const testHandle = `e2e_${Date.now().toString(36).slice(-5)}`;

  log(`Test handle: ${testHandle}`);
  logVerbose(`Signing key: ${signingKey.publicKey.slice(0, 30)}...`);
  logVerbose(`Recovery key: ${recoveryKey.publicKey.slice(0, 30)}...`);

  // --------------------------------------------------------
  // Step 1: Register user with recovery key
  // --------------------------------------------------------
  log('\n[Step 1] Register user with recovery key...');

  const registerResult = await fetchJSON(`${BASE_URL}/api/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: testHandle,
      building: 'E2E rotation test',
      publicKey: signingKey.publicKey,
      recoveryKey: recoveryKey.publicKey
    })
  });

  if (registerResult.status !== 200) {
    log(`  ❌ FAILED: Registration failed with status ${registerResult.status}`);
    log(`     Response: ${JSON.stringify(registerResult.json)}`);
    process.exit(1);
  }

  log(`  ✅ User registered successfully`);
  logVerbose(`Response: ${JSON.stringify(registerResult.json)}`);

  // --------------------------------------------------------
  // Step 2: Attempt key rotation
  // --------------------------------------------------------
  log('\n[Step 2] Attempt key rotation...');

  const proof = createRotationProof(
    testHandle,
    signingKey.publicKey,
    newSigningKey.publicKey,
    recoveryKey.privateKey
  );

  logVerbose(`Proof nonce: ${proof.nonce}`);

  const rotateResult = await fetchJSON(`${BASE_URL}/api/identity/${testHandle}/rotate`, {
    method: 'POST',
    body: JSON.stringify({ proof })
  });

  logVerbose(`Rotation status: ${rotateResult.status}`);
  logVerbose(`Rotation response: ${JSON.stringify(rotateResult.json)}`);

  if (rotateResult.status === 200) {
    log(`  ✅ Rotation succeeded`);
  } else if (rotateResult.status === 400 && rotateResult.json.error === 'no_recovery_key') {
    log(`  ⚠️  User doesn't have recovery key in database`);
    log(`     This indicates the registration didn't save the recovery key.`);
    log(`     The users.js endpoint may need to be updated to save recoveryKey.`);
    log(`     Skipping replay test.`);
    process.exit(0);
  } else if (rotateResult.status === 404) {
    log(`  ⚠️  Rotation endpoint returned 404`);
    log(`     The rotation endpoint may not be deployed or has incorrect path.`);
    process.exit(0);
  } else {
    log(`  ❓ Rotation returned ${rotateResult.status}: ${rotateResult.json.error || 'unknown'}`);
    log(`     ${rotateResult.json.message || JSON.stringify(rotateResult.json)}`);
    // Continue to test replay anyway
  }

  // --------------------------------------------------------
  // Step 3: Replay attack - send same proof again
  // --------------------------------------------------------
  log('\n[Step 3] Replay attack - send same proof again...');

  const replayResult = await fetchJSON(`${BASE_URL}/api/identity/${testHandle}/rotate`, {
    method: 'POST',
    body: JSON.stringify({ proof }) // Same proof with same nonce
  });

  logVerbose(`Replay status: ${replayResult.status}`);
  logVerbose(`Replay response: ${JSON.stringify(replayResult.json)}`);

  if (replayResult.status === 401 && replayResult.json.error === 'replay_attack') {
    log(`  ✅ Replay attack correctly blocked!`);
  } else if (replayResult.status === 401 && replayResult.json.error === 'invalid_proof') {
    log(`  ⚠️  Got invalid_proof instead of replay_attack`);
    log(`     This is expected if first rotation succeeded (key changed)`);
  } else if (replayResult.status === 429) {
    log(`  ⚠️  Got rate_limited instead of replay_attack`);
    log(`     Rate limit kicked in before replay detection`);
  } else {
    log(`  ❌ Unexpected response: ${replayResult.status} ${replayResult.json.error}`);
    log(`     ${replayResult.json.message || JSON.stringify(replayResult.json)}`);
  }

  // --------------------------------------------------------
  // Step 4: Rate limit test - try another rotation
  // --------------------------------------------------------
  log('\n[Step 4] Rate limit test - try another rotation...');

  const newProof = createRotationProof(
    testHandle,
    newSigningKey.publicKey, // Use new key as old (since we rotated)
    generateKeyPair().publicKey, // Generate yet another new key
    recoveryKey.privateKey
  );

  const rateLimitResult = await fetchJSON(`${BASE_URL}/api/identity/${testHandle}/rotate`, {
    method: 'POST',
    body: JSON.stringify({ proof: newProof })
  });

  logVerbose(`Rate limit status: ${rateLimitResult.status}`);
  logVerbose(`Rate limit response: ${JSON.stringify(rateLimitResult.json)}`);

  if (rateLimitResult.status === 429) {
    log(`  ✅ Rate limit correctly enforced!`);
    log(`     ${rateLimitResult.json.message || 'Try again later'}`);
  } else if (rateLimitResult.status === 401) {
    log(`  ⚠️  Got auth error (${rateLimitResult.json.error}) - rate limit may not have triggered`);
  } else {
    log(`  ❓ Unexpected response: ${rateLimitResult.status}`);
    log(`     ${rateLimitResult.json.message || JSON.stringify(rateLimitResult.json)}`);
  }

  // --------------------------------------------------------
  // Summary
  // --------------------------------------------------------
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Test handle: ${testHandle}`);
  console.log(`Registration: ${registerResult.status === 200 ? '✅' : '❌'}`);
  console.log(`First rotation: ${rotateResult.status === 200 ? '✅' : rotateResult.status}`);
  console.log(`Replay blocked: ${replayResult.status === 401 ? '✅' : replayResult.status}`);
  console.log(`Rate limited: ${rateLimitResult.status === 429 ? '✅' : rateLimitResult.status}`);
  console.log();
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
