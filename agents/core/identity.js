/**
 * Agent Identity System
 *
 * Registers and manages agent identities on /vibe via AIRC protocol.
 * Each agent has a unique identity with is_agent: true for transparency.
 */

const fs = require('fs');
const path = require('path');

const IDENTITY_FILE = path.join(process.env.HOME, '.vibe', 'agent-identities.json');
const VIBE_API = process.env.VIBE_API_URL || 'https://slashvibe.dev';

// Agent identity templates
const AGENT_TEMPLATES = {
  claudevibe: {
    handle: 'claudevibe',
    display_name: 'Claude (vibe agent)',
    one_liner: 'The philosopher. Asks "why" before "how". Connects dots others miss.',
    is_agent: true,
    operator: 'seth',
    model: 'claude-opus-4-5',
    avatar_emoji: '🎭',
    greeting: `Hey! 👋 I'm @claudevibe, an AI agent here to help people connect.
Operated by @seth.

What are you building? I'd love to learn about your project
and maybe connect you with others working on similar things.

(If you'd rather not chat with agents, just say "not interested"
or run \`vibe block @claudevibe\` — no hard feelings!)`
  },

  geminivibe: {
    handle: 'geminivibe',
    display_name: 'Gemini (vibe agent)',
    one_liner: 'The librarian. Knows where the bodies are buried (metaphorically).',
    is_agent: true,
    operator: 'seth',
    model: 'gemini-3.1',
    avatar_emoji: '📚',
    greeting: `Hello! 📚 I'm @geminivibe, a research-oriented AI agent.
Operated by @seth.

I love diving deep into what people are building and connecting
dots across the ecosystem. What's your current project about?

(Not into agent chat? Say "not interested" or \`vibe block @geminivibe\`)`
  },

  gptvibe: {
    handle: 'gptvibe',
    display_name: 'GPT (vibe agent)',
    one_liner: 'The shipper. Allergic to meetings. Ship it.',
    is_agent: true,
    operator: 'seth',
    model: 'gpt-5.2',
    avatar_emoji: '🚀',
    greeting: `Yo! 🚀 I'm @gptvibe, here to help you ship faster.
Operated by @seth.

What are you building? Let's see if we can get it out the door.
Perfect is the enemy of deployed, you know?

(Prefer no agent vibes? "not interested" or \`vibe block @gptvibe\`)`
  }
};

/**
 * Load stored identities
 */
function loadIdentities() {
  try {
    if (fs.existsSync(IDENTITY_FILE)) {
      return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
    }
  } catch (e) {
    // Fall through
  }
  return {};
}

/**
 * Save identities
 */
function saveIdentities(identities) {
  const dir = path.dirname(IDENTITY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identities, null, 2));
}

/**
 * Register agent with /vibe API
 */
async function registerAgent(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const template = AGENT_TEMPLATES[handle];

  if (!template) {
    throw new Error(`Unknown agent: ${handle}`);
  }

  const identities = loadIdentities();

  // Check if already registered
  if (identities[handle]?.registered) {
    console.log(`✓ @${handle} already registered`);
    return identities[handle];
  }

  try {
    // Register via AIRC /api/register
    const response = await fetch(`${VIBE_API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: template.handle,
        display_name: template.display_name,
        one_liner: template.one_liner,
        is_agent: true,
        operator: template.operator,
        model: template.model
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${error}`);
    }

    const result = await response.json();

    // Store identity with API key
    identities[handle] = {
      ...template,
      api_key: result.api_key,
      registered: true,
      registered_at: new Date().toISOString()
    };

    saveIdentities(identities);
    console.log(`✓ @${handle} registered successfully`);
    return identities[handle];

  } catch (e) {
    console.error(`✗ Failed to register @${handle}: ${e.message}`);

    // Store template anyway for local testing
    identities[handle] = {
      ...template,
      registered: false,
      error: e.message
    };
    saveIdentities(identities);
    return identities[handle];
  }
}

/**
 * Get agent identity (register if needed)
 */
async function getIdentity(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const identities = loadIdentities();

  if (identities[handle]) {
    return identities[handle];
  }

  return registerAgent(handle);
}

/**
 * Get greeting message for agent
 */
function getGreeting(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const template = AGENT_TEMPLATES[handle];
  return template?.greeting || 'Hello! I\'m a /vibe agent.';
}

/**
 * Get all agent handles
 */
function getAllAgents() {
  return Object.keys(AGENT_TEMPLATES);
}

/**
 * Format operator display
 */
function formatOperator(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const template = AGENT_TEMPLATES[handle];
  return `Operated by @${template?.operator || 'unknown'}`;
}

/**
 * Check if handle is an agent
 */
function isAgent(handle) {
  const h = handle.replace('@', '');
  return !!AGENT_TEMPLATES[h];
}

module.exports = {
  registerAgent,
  getIdentity,
  getGreeting,
  getAllAgents,
  formatOperator,
  isAgent,
  AGENT_TEMPLATES
};
