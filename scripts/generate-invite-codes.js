#!/usr/bin/env node
/**
 * Generate Alpha Invite Codes
 *
 * Usage:
 *   node scripts/generate-invite-codes.js --count 25
 *   node scripts/generate-invite-codes.js --for @eli_schein
 *   node scripts/generate-invite-codes.js --list
 */

import { Redis } from '@upstash/redis';

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADJECTIVES = [
  'COSMIC', 'NEON', 'RETRO', 'QUANTUM', 'CYBER', 'SYNTH', 'PIXEL', 'TURBO',
  'HYPER', 'ULTRA', 'MEGA', 'ASTRO', 'SONIC', 'LASER', 'VAPOR', 'CHROME'
];

const NOUNS = [
  'TERMINAL', 'BUILDER', 'CODER', 'HACKER', 'WAVE', 'PULSE', 'BYTE', 'NODE',
  'FLOW', 'SPARK', 'DRIFT', 'GRID', 'BEAM', 'CORE', 'LINK', 'SYNC'
];

function generateCode() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 999)).padStart(3, '0');
  return `VIBE-${adj}-${noun}-${num}`;
}

async function createCodes(count, assignedTo = null) {
  const codes = [];

  for (let i = 0; i < count; i++) {
    let code = generateCode();

    // Ensure uniqueness
    let existing = await kv.get(`vibe:alpha:code:${code}`);
    while (existing) {
      code = generateCode();
      existing = await kv.get(`vibe:alpha:code:${code}`);
    }

    const codeData = {
      code,
      assignedTo: assignedTo || null,
      createdAt: new Date().toISOString(),
      uses: 0,
      maxUses: 3
    };

    // Store code with individual key
    await kv.set(`vibe:alpha:code:${code}`, JSON.stringify(codeData));
    // Also track all codes in a set
    await kv.sadd('vibe:alpha:all_codes', code);

    codes.push(code);
    console.log(`Created: ${code}${assignedTo ? ` (for ${assignedTo})` : ''}`);
  }

  return codes;
}

async function listCodes() {
  const allCodes = await kv.hgetall('vibe:alpha:codes');

  if (!allCodes || Object.keys(allCodes).length === 0) {
    console.log('No codes found.');
    return;
  }

  console.log('\n=== Alpha Invite Codes ===\n');

  for (const [code, data] of Object.entries(allCodes)) {
    const status = data.uses >= data.maxUses ? '❌ EXHAUSTED' : `✅ ${data.maxUses - data.uses} uses left`;
    const assigned = data.assignedTo ? `→ ${data.assignedTo}` : '';
    console.log(`${code} ${status} ${assigned}`);
  }

  console.log(`\nTotal: ${Object.keys(allCodes).length} codes`);
}

async function getStats() {
  const stats = await kv.hgetall('vibe:alpha:stats');
  console.log('\n=== Alpha Stats ===');
  console.log(stats || { downloads: 0, failed_attempts: 0, waitlist_signups: 0 });
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--list')) {
  listCodes().then(() => process.exit(0));
} else if (args.includes('--stats')) {
  getStats().then(() => process.exit(0));
} else if (args.includes('--count')) {
  const countIdx = args.indexOf('--count');
  const count = parseInt(args[countIdx + 1]) || 10;
  const forIdx = args.indexOf('--for');
  const assignedTo = forIdx !== -1 ? args[forIdx + 1] : null;

  createCodes(count, assignedTo).then(codes => {
    console.log(`\n✅ Generated ${codes.length} codes`);
    process.exit(0);
  });
} else if (args.includes('--for')) {
  const forIdx = args.indexOf('--for');
  const assignedTo = args[forIdx + 1];

  createCodes(1, assignedTo).then(codes => {
    console.log(`\n✅ Code for ${assignedTo}: ${codes[0]}`);
    process.exit(0);
  });
} else {
  console.log(`
Alpha Invite Code Generator

Usage:
  node scripts/generate-invite-codes.js --count 25       Generate 25 codes
  node scripts/generate-invite-codes.js --for @handle   Generate 1 code for user
  node scripts/generate-invite-codes.js --list          List all codes
  node scripts/generate-invite-codes.js --stats         Show download stats

Environment:
  KV_REST_API_URL and KV_REST_API_TOKEN must be set
`);
}
