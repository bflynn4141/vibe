#!/usr/bin/env node
const API_URL = process.env.VIBE_API_URL || 'http://localhost:3000';
const MSG_COUNT = Number(process.env.MSG_COUNT || 20);

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function register(handle) {
  const { status, json } = await fetchJson('/api/presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username: handle })
  });
  if (status !== 200 || !json.token) {
    throw new Error(`register failed for @${handle}: ${status} ${JSON.stringify(json)}`);
  }
  return json.token;
}

async function sendMessage(token, from, to, text) {
  const { status, json } = await fetchJson('/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ from, to, text })
  });
  if (status !== 200) {
    throw new Error(`send failed: ${status} ${JSON.stringify(json)}`);
  }
  return json.message;
}

async function getThread(user, other) {
  const { status, json } = await fetchJson(`/api/messages?user=${user}&with=${other}`);
  if (status !== 200) {
    throw new Error(`thread fetch failed: ${status} ${JSON.stringify(json)}`);
  }
  return json.thread || [];
}

function uniqueHandle(prefix) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}_${suffix}`.toLowerCase();
}

async function main() {
  const alice = uniqueHandle('test_alice');
  const bob = uniqueHandle('test_bob');

  const tokenAlice = await register(alice);
  await register(bob);

  const marker = `${Date.now().toString(36)}`;
  const payloads = Array.from({ length: MSG_COUNT }, (_, i) => ({
    text: `concurrency-${marker}-${i}`
  }));

  await Promise.all(payloads.map(p => sendMessage(tokenAlice, alice, bob, p.text)));

  const thread = await getThread(alice, bob);
  const texts = new Set(thread.map(m => m.text));

  const missing = payloads.filter(p => !texts.has(p.text));
  if (missing.length > 0) {
    throw new Error(`missing ${missing.length} messages in thread`);
  }

  if (thread.length !== MSG_COUNT) {
    throw new Error(`expected ${MSG_COUNT} messages, got ${thread.length}`);
  }

  console.log(`PASS: concurrency test (${MSG_COUNT} messages)`);
}

main().catch(err => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
