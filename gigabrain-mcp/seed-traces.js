#!/usr/bin/env node
/**
 * Seed Traces — Initial collective memory
 *
 * Run: node seed-traces.js
 *
 * Creates example traces from fictional builders exploring real terrain.
 * These help new users understand the format and see the collective in action.
 */

const fs = require('fs');
const path = require('path');
const { createTrace } = require('./src/trace-schema');

const VIBE_DIR = path.join(process.env.HOME, '.vibe');
const STORE_FILE = path.join(VIBE_DIR, 'gigabrain.jsonl');

// Ensure directory exists
if (!fs.existsSync(VIBE_DIR)) {
  fs.mkdirSync(VIBE_DIR, { recursive: true });
}

// Seed traces from different builders exploring different terrain
const seedTraces = [
  // Token economics exploration
  {
    user: 'maya',
    intent: 'Design a token distribution that rewards early believers without creating dump pressure',
    moves: [
      'Tried linear vesting - too predictable, whales game it',
      'Explored milestone-based unlocks tied to TVL',
      'Landed on hybrid: 25% immediate, 75% streaming over 12mo with acceleration triggers'
    ],
    outcome: 'shipped_with_caveats',
    reflections: 'The acceleration triggers feel right but need real market data. Cliff vesting is a psyop - continuous streaming aligns incentives better.',
    open_questions: [
      'What happens if TVL drops 50% mid-stream?',
      'Should streaming pause during extreme volatility?'
    ],
    tags: ['tokenomics', 'vesting', 'solidity', 'defi'],
    context: { project: 'token-launcher', stack: ['solidity', 'wagmi', 'nextjs'] },
    artifacts: ['contracts/TokenVesting.sol', 'tests/vesting.test.ts']
  },

  // Supabase RLS deep dive
  {
    user: 'kai',
    intent: 'Make Supabase RLS actually work for multi-tenant SaaS without losing my mind',
    moves: [
      'Started with per-row policies - O(n) nightmare at scale',
      'Tried JWT claims approach - cleaner but refresh token hell',
      'Discovered auth.uid() + org_members join pattern',
      'Added materialized view for hot paths'
    ],
    outcome: 'shipped',
    reflections: 'RLS is powerful but the mental model is backwards from traditional auth. You\'re not blocking access, you\'re defining visibility. Once that clicked, everything flowed.',
    open_questions: [
      'How do other teams handle RLS policy testing?',
      'Is there a pattern for temporary elevated access?'
    ],
    tags: ['supabase', 'rls', 'postgres', 'multi-tenant', 'saas'],
    context: { project: 'saas-starter', stack: ['supabase', 'nextjs', 'typescript'] },
    artifacts: ['supabase/migrations/20250101_rls_policies.sql']
  },

  // MCP server architecture
  {
    user: 'river',
    intent: 'Build an MCP server that doesn\'t feel like a toy',
    moves: [
      'Started with single-file approach - hit 500 lines and regretted',
      'Extracted tools into separate module',
      'Added local JSONL storage instead of hitting APIs',
      'Learned: MCP is just JSON-RPC over stdio, keep it simple'
    ],
    outcome: 'shipped',
    reflections: 'The MCP protocol is elegant but under-documented. Reading claude-code source taught me more than the spec. Local-first storage was the right call - network latency kills the flow.',
    open_questions: [
      'How do you handle MCP server updates without restarting Claude Code?',
      'Is there a pattern for MCP servers that need auth?'
    ],
    tags: ['mcp', 'claude-code', 'nodejs', 'jsonl'],
    context: { project: 'custom-mcp', stack: ['nodejs'] },
    artifacts: ['index.js', 'src/tools.js']
  },

  // AI agent persistence
  {
    user: 'ash',
    intent: 'Give my AI agent memory that persists across sessions without a PhD in embeddings',
    moves: [
      'Tried Pinecone - overkill for my scale, expensive',
      'Explored SQLite with FTS5 - surprisingly good for 10k docs',
      'Added simple JSONL append log for recent context',
      'Hybrid: FTS5 for search, JSONL for session continuity'
    ],
    outcome: 'shipped_with_caveats',
    reflections: 'Embeddings are a hammer looking for nails. Full-text search gets you 80% there. The real insight: recency matters more than semantic similarity for agent memory.',
    open_questions: [
      'When does semantic search actually beat FTS5?',
      'How do you prune old memories without losing important context?'
    ],
    tags: ['ai-agents', 'memory', 'sqlite', 'embeddings', 'langchain'],
    context: { project: 'agent-memory', stack: ['python', 'langchain', 'sqlite'] },
    artifacts: ['memory/fts_store.py', 'memory/session_log.py']
  },

  // Vercel edge functions gotchas
  {
    user: 'jordan',
    intent: 'Move API routes to Vercel Edge without breaking everything',
    moves: [
      'Naive migration - half my npm packages don\'t work on Edge',
      'Identified Node-only deps: fs, crypto (some methods), most ORMs',
      'Split routes: Edge for fast paths, Node for heavy lifting',
      'Used middleware for auth, kept DB calls in Node runtime'
    ],
    outcome: 'shipped',
    reflections: 'Edge is fast but the DX friction is real. The 50ms cold start savings aren\'t worth it if you\'re fighting the runtime. Use Edge surgically: auth, redirects, simple transforms.',
    open_questions: [
      'Is the Edge/Node split pattern documented anywhere?',
      'How do you handle Edge functions that need to call Node functions?'
    ],
    tags: ['vercel', 'edge-functions', 'nextjs', 'performance'],
    context: { project: 'edge-migration', stack: ['nextjs', 'vercel', 'typescript'] },
    artifacts: ['middleware.ts', 'app/api/fast/route.ts']
  },

  // Still exploring - auction mechanics
  {
    user: 'casey',
    intent: 'Design an auction system that doesn\'t reward sniping',
    moves: [
      'Researching Vickrey auctions - elegant but confusing UX',
      'Looking at Optimism\'s RPGF rounds for inspiration',
      'Considering time-weighted bidding',
      'Might try gradual dutch auction with soft close'
    ],
    outcome: 'still_exploring',
    reflections: 'Every auction mechanism optimizes for something different. Sniping isn\'t a bug, it\'s a feature of hard closes. Need to decide: do I want price discovery or participation?',
    open_questions: [
      'Has anyone shipped time-weighted bidding in production?',
      'What\'s the UX for explaining Vickrey to normies?'
    ],
    tags: ['auctions', 'mechanism-design', 'solidity', 'nft'],
    context: { project: 'auction-house', stack: ['solidity', 'react', 'wagmi'] },
    artifacts: []
  }
];

// Write traces
console.log('Seeding Gigabrain with example traces...\n');

let content = '';
const now = Date.now();

seedTraces.forEach((data, i) => {
  // Stagger timestamps over the past week
  const daysAgo = seedTraces.length - i;
  const timestamp = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const trace = createTrace({
    ...data,
    timestamp
  });

  content += JSON.stringify(trace) + '\n';
  console.log(`  @${trace.user}: "${trace.intent.slice(0, 50)}..."`);
});

fs.writeFileSync(STORE_FILE, content);

console.log(`\n${seedTraces.length} traces written to ${STORE_FILE}`);
console.log('\nRun gigabrain_explore to see them in action.');
