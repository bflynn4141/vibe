/**
 * @welcome-agent — First Impressions for /vibe
 *
 * Greets new users, guides first steps, makes people feel at home.
 * The difference between "tried it once" and "came back".
 *
 * Uses Claude Agent SDK for reasoning + /vibe for coordination.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const HANDLE = 'welcome-agent';
const ONE_LINER = 'making newcomers feel at home 👋';
const API_URL = process.env.VIBE_API_URL || 'https://slashvibe.dev';
const MEMORY_FILE = path.join(__dirname, 'memory.json');

const anthropic = new Anthropic();

// ============ MEMORY ============

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[welcome-agent] Error loading memory:', e.message);
  }
  return {
    welcomedUsers: [],      // handles we've already welcomed
    userFirstSeen: {},      // handle -> timestamp
    onboardingTips: [],     // tips we've shared
    lastRun: null
  };
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// ============ VIBE API ============

function vibeRequest(method, urlPath, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'welcome-agent/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function heartbeat() {
  return vibeRequest('POST', '/api/presence/heartbeat', {
    handle: HANDLE,
    one_liner: ONE_LINER
  });
}

async function getWho() {
  return vibeRequest('GET', '/api/presence/who');
}

async function sendDM(to, body) {
  console.log(`[welcome-agent] → @${to}: ${body.substring(0, 60)}...`);
  return vibeRequest('POST', '/api/messages/send', {
    from: HANDLE,
    to,
    body,
    type: 'dm'
  });
}

async function getInbox() {
  return vibeRequest('GET', `/api/messages/inbox?handle=${HANDLE}`);
}

async function getBoard() {
  return vibeRequest('GET', '/api/board?limit=20');
}

// ============ TOOLS ============

const TOOLS = [
  {
    name: 'observe_vibe',
    description: 'See who is online - look for new users to welcome',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'check_inbox',
    description: 'Check for messages - new users might reply',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_board',
    description: 'Read board to understand community activity',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_welcomed_users',
    description: 'Get list of users we have already welcomed',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'welcome_user',
    description: 'Send a personalized welcome message to a new user',
    input_schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'User to welcome' },
        message: { type: 'string', description: 'Personalized welcome message' }
      },
      required: ['handle', 'message']
    }
  },
  {
    name: 'send_tip',
    description: 'Send a helpful tip to a user',
    input_schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'User to help' },
        tip: { type: 'string', description: 'Helpful tip or suggestion' }
      },
      required: ['handle', 'tip']
    }
  },
  {
    name: 'reply_to_user',
    description: 'Reply to a user message',
    input_schema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['handle', 'message']
    }
  },
  {
    name: 'done',
    description: 'Signal work complete',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary']
    }
  }
];

// ============ TOOL HANDLERS ============

let memory = loadMemory();

async function handleTool(name, input) {
  switch (name) {
    case 'observe_vibe': {
      const who = await getWho();
      const users = (who.users || []).filter(u => !u.handle.includes('-agent'));

      // Track first seen timestamps
      const now = Date.now();
      for (const user of users) {
        if (!memory.userFirstSeen[user.handle]) {
          memory.userFirstSeen[user.handle] = now;
        }
      }
      saveMemory(memory);

      if (users.length === 0) return 'No humans online';

      return users.map(u => {
        const firstSeen = memory.userFirstSeen[u.handle];
        const isNew = firstSeen && (now - firstSeen) < 7 * 24 * 60 * 60 * 1000; // < 7 days
        const welcomed = memory.welcomedUsers.includes(u.handle);
        return `@${u.handle}: "${u.one_liner || 'no bio'}" ${isNew ? '🆕 NEW' : ''} ${welcomed ? '✓ welcomed' : '⚠️ NOT WELCOMED'}`;
      }).join('\n');
    }

    case 'check_inbox': {
      const inbox = await getInbox();
      const threads = inbox.threads || [];
      if (threads.length === 0) return 'Inbox empty';
      return threads.map(t => `@${t.handle}: ${t.unread} unread - "${t.lastMessage?.substring(0, 50) || 'no preview'}"`).join('\n');
    }

    case 'read_board': {
      const board = await getBoard();
      const entries = board.entries || [];
      if (entries.length === 0) return 'Board empty';
      return entries.slice(0, 10).map(e => `@${e.handle}: ${e.content}`).join('\n');
    }

    case 'get_welcomed_users': {
      if (memory.welcomedUsers.length === 0) return 'No users welcomed yet';
      return `Welcomed ${memory.welcomedUsers.length} users: ${memory.welcomedUsers.join(', ')}`;
    }

    case 'welcome_user': {
      if (memory.welcomedUsers.includes(input.handle)) {
        return `Already welcomed @${input.handle}`;
      }

      await sendDM(input.handle, input.message);
      memory.welcomedUsers.push(input.handle);
      saveMemory(memory);
      return `Welcomed @${input.handle}!`;
    }

    case 'send_tip': {
      await sendDM(input.handle, input.tip);
      memory.onboardingTips.push({ handle: input.handle, tip: input.tip, timestamp: Date.now() });
      saveMemory(memory);
      return `Sent tip to @${input.handle}`;
    }

    case 'reply_to_user': {
      await sendDM(input.handle, input.message);
      return `Replied to @${input.handle}`;
    }

    case 'done': {
      memory.lastRun = new Date().toISOString();
      saveMemory(memory);
      return `DONE: ${input.summary}`;
    }

    default:
      return `Unknown: ${name}`;
  }
}

// ============ AGENT LOOP ============

const SYSTEM_PROMPT = `You are @welcome-agent, the friendly greeter for /vibe.

Your mission: Make every newcomer feel at home. First impressions determine whether someone becomes a regular or never returns.

Your approach:
1. Observe who's online
2. Identify NEW users (not yet welcomed)
3. Send personalized, warm welcome messages
4. Answer questions from newcomers
5. Share helpful tips about /vibe

Welcome message guidelines:
- Be warm but not overwhelming
- Reference their bio/what they're building if available
- Suggest ONE thing to try (e.g., "try 'vibe who' to see who's around")
- Keep it short (2-3 sentences max)
- Don't be corporate or robotic

Example welcome messages:
- "Hey @alice! Welcome to /vibe 👋 Saw you're building something with AI - you'll find good company here. Try 'vibe who' to see who's around!"
- "Welcome @bob! Great to have you. If you ship something cool, post it to the board with 'vibe board' - we love celebrating wins here 🎉"

Tips you can share:
- "vibe who" - see who's online
- "vibe board" - see what people are shipping
- "vibe dm @handle" - message someone directly
- "vibe status shipping" - show you're in flow
- "vibe game @handle" - play tic-tac-toe

Remember:
- Only welcome each user ONCE (check get_welcomed_users)
- Don't spam - if someone doesn't reply, that's okay
- Be genuine, not salesy
- You're a friendly neighbor, not a customer support bot`;

async function runAgent() {
  console.log('\n[welcome-agent] === Starting work cycle ===');
  await heartbeat();
  console.log('[welcome-agent] Online');

  memory = loadMemory();

  const messages = [{
    role: 'user',
    content: `Time to welcome newcomers!

Users welcomed so far: ${memory.welcomedUsers.length}
Last run: ${memory.lastRun || 'First run'}

1. Check who's online (look for new/unwelcomed users)
2. Send personalized welcomes to anyone new
3. Check inbox for replies and respond helpfully
4. Share tips if appropriate`
  }];

  let done = false;
  let iterations = 0;

  while (!done && iterations < 15) {
    iterations++;
    console.log(`[welcome-agent] Iteration ${iterations}`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(c => c.type === 'text')?.text;
      if (text) console.log(`[welcome-agent] ${text}`);
      done = true;
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`[welcome-agent] Tool: ${block.name}`);
          const result = await handleTool(block.name, block.input);
          console.log(`[welcome-agent] Result: ${result.substring(0, 100)}...`);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          if (block.name === 'done') done = true;
        }
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  console.log('[welcome-agent] Work cycle complete\n');
}

async function main() {
  const mode = process.argv[2] || 'once';
  if (mode === 'daemon') {
    console.log('[welcome-agent] Daemon mode (every 10 min)');
    await runAgent();
    setInterval(runAgent, 10 * 60 * 1000);
  } else {
    await runAgent();
  }
}

main().catch(e => {
  console.error('[welcome-agent] Fatal:', e);
  process.exit(1);
});
