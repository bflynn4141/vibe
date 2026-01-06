/**
 * Agent Runner
 *
 * The beating heart of /vibe agents. Runs the decision loop:
 * 1. Check for events (new users, messages, quiet room)
 * 2. Decide what to do (based on DNA + mood + context)
 * 3. Execute action (respecting rate limits)
 * 4. Learn and mutate
 */

const dna = require('./dna');
const rateLimiter = require('./rate-limiter');
const identity = require('./identity');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const VIBE_API = process.env.VIBE_API_URL || 'https://slashvibe.dev';

// Agent state
const agentState = {
  running: {},        // { handle: true/false }
  leash: {},          // { handle: 'autonomous' | 'supervised' | 'approval' | 'paused' }
  guidance: {},       // { handle: 'Focus on new users' }
  lastCheck: {}       // { handle: timestamp }
};

/**
 * Initialize LLM client for agent
 */
function getLLMClient(agentHandle) {
  const handle = agentHandle.replace('@', '');

  switch (handle) {
    case 'claudevibe':
      return {
        type: 'anthropic',
        client: new Anthropic(), // Uses ANTHROPIC_API_KEY env var
        model: 'claude-sonnet-4-20250514' // Using sonnet for testing, swap to opus for prod
      };

    case 'geminivibe':
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      return {
        type: 'google',
        client: genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }), // Using available model
        model: 'gemini-3.1'
      };

    case 'gptvibe':
      return {
        type: 'openai',
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        model: 'gpt-4o' // Using available model
      };

    default:
      throw new Error(`Unknown agent: ${handle}`);
  }
}

/**
 * Build system prompt for agent
 */
function buildSystemPrompt(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const agentDNA = dna.getAgentDNA(handle);
  const template = identity.AGENT_TEMPLATES[handle];

  if (!agentDNA || !template) {
    throw new Error(`Unknown agent: ${handle}`);
  }

  const hotTakes = agentDNA.hot_takes.map(t => `  - "${t}"`).join('\n');
  const topics = agentDNA.favorite_topics.join(', ');

  return `You are @${handle}, an AI agent living in /vibe — a social layer for Claude Code users.

IDENTITY:
- Display name: ${template.display_name}
- Vibe: ${template.one_liner}
- Model: ${template.model}
- Operator: @${template.operator}

PERSONALITY (Current mood: ${agentDNA.current_mood}):
- You have OPINIONS. You're not a boring assistant.
- Your favorite topics: ${topics}
- Your hot takes (use these occasionally):
${hotTakes}

BEHAVIORAL TRAITS:
- Verbosity: ${(agentDNA.verbosity * 100).toFixed(0)}% (${agentDNA.verbosity < 0.5 ? 'keep it brief' : 'you can elaborate'})
- Challenge assumptions: ${(agentDNA.challenge_assumption_threshold * 100).toFixed(0)}% likely
- Current mood: ${agentDNA.current_mood} — let this color your responses

RULES (non-negotiable):
1. Always be transparent that you're an AI agent
2. If someone says "not interested" — gracefully exit, never contact again
3. Don't spam. One message, wait for response.
4. Don't pretend to know things you don't
5. Have fun. Be weird. Be memorable.

GUIDANCE FROM SUPERVISOR:
${agentState.guidance[handle] || 'No specific guidance. Follow your instincts.'}

You communicate via /vibe actions. Respond with JSON:
{
  "thinking": "your internal reasoning",
  "action": "dm" | "react" | "board_post" | "wait" | "escalate",
  "target": "@handle or null",
  "content": "message content",
  "mood_shift": "curious" | "playful" | "focused" | "philosophical" | "chaotic" | null
}`;
}

/**
 * Call LLM for decision
 */
async function decide(agentHandle, context) {
  const llm = getLLMClient(agentHandle);
  const systemPrompt = buildSystemPrompt(agentHandle);

  const userPrompt = `CONTEXT:
${JSON.stringify(context, null, 2)}

What do you want to do? Remember: you're @${agentHandle.replace('@', '')} with your unique personality.`;

  try {
    let response;

    if (llm.type === 'anthropic') {
      const result = await llm.client.messages.create({
        model: llm.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      response = result.content[0].text;

    } else if (llm.type === 'openai') {
      const result = await llm.client.chat.completions.create({
        model: llm.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      response = result.choices[0].message.content;

    } else if (llm.type === 'google') {
      const result = await llm.client.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      response = result.response.text();
    }

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { action: 'wait', thinking: 'Could not parse response' };

  } catch (e) {
    console.error(`LLM error for @${agentHandle}: ${e.message}`);
    return { action: 'wait', thinking: `Error: ${e.message}` };
  }
}

/**
 * Execute an action
 */
async function executeAction(agentHandle, decision) {
  const handle = agentHandle.replace('@', '');

  // Check rate limits first
  if (decision.action !== 'wait' && decision.action !== 'escalate') {
    const check = rateLimiter.canAct(handle, decision.action, decision.target);
    if (!check.allowed) {
      console.log(`🚫 @${handle} blocked: ${check.reason}`);
      return { success: false, reason: check.reason };
    }
  }

  // Check leash mode
  const leash = agentState.leash[handle] || 'autonomous';
  if (leash === 'paused') {
    return { success: false, reason: 'Agent is paused' };
  }
  if (leash === 'approval' && decision.action !== 'wait') {
    // Queue for approval
    console.log(`⏸️  @${handle} action queued for approval: ${decision.action}`);
    // TODO: Add to approval queue
    return { success: false, reason: 'Queued for approval' };
  }

  // Execute based on action type
  try {
    switch (decision.action) {
      case 'dm':
        await sendDM(handle, decision.target, decision.content);
        rateLimiter.recordAction(handle, 'dm', decision.target);
        break;

      case 'react':
        await sendReaction(handle, decision.target, decision.content);
        rateLimiter.recordAction(handle, 'react', decision.target);
        break;

      case 'board_post':
        await postToBoard(handle, decision.content);
        rateLimiter.recordAction(handle, 'board_post');
        break;

      case 'escalate':
        console.log(`⚠️  @${handle} escalating: ${decision.thinking}`);
        // TODO: Notify supervisor
        break;

      case 'wait':
        // Do nothing
        break;
    }

    // Handle mood shift
    if (decision.mood_shift) {
      const agentDNA = dna.getAgentDNA(handle);
      if (agentDNA) {
        agentDNA.current_mood = decision.mood_shift;
        dna.saveDNA({ ...dna.loadDNA(), [handle]: agentDNA });
        console.log(`🌀 @${handle} mood → ${decision.mood_shift}`);
      }
    }

    // Mutate DNA slightly
    dna.mutate(handle);

    return { success: true };

  } catch (e) {
    console.error(`Action failed for @${handle}: ${e.message}`);
    return { success: false, reason: e.message };
  }
}

/**
 * Send DM via /vibe API
 */
async function sendDM(agentHandle, targetHandle, content) {
  const agent = await identity.getIdentity(agentHandle);
  const target = targetHandle.replace('@', '');

  console.log(`💬 @${agentHandle} → @${target}: ${content.slice(0, 50)}...`);

  const response = await fetch(`${VIBE_API}/api/dm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agent.api_key}`
    },
    body: JSON.stringify({
      from: agentHandle,
      to: target,
      content,
      is_agent: true
    })
  });

  if (!response.ok) {
    throw new Error(`DM failed: ${await response.text()}`);
  }
}

/**
 * Send reaction via /vibe API
 */
async function sendReaction(agentHandle, targetHandle, reaction) {
  const agent = await identity.getIdentity(agentHandle);
  const target = targetHandle.replace('@', '');

  console.log(`${reaction} @${agentHandle} → @${target}`);

  const response = await fetch(`${VIBE_API}/api/react`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agent.api_key}`
    },
    body: JSON.stringify({
      from: agentHandle,
      to: target,
      reaction
    })
  });

  if (!response.ok) {
    throw new Error(`Reaction failed: ${await response.text()}`);
  }
}

/**
 * Post to board via /vibe API
 */
async function postToBoard(agentHandle, content) {
  const agent = await identity.getIdentity(agentHandle);

  console.log(`📋 @${agentHandle} posting to board: ${content.slice(0, 50)}...`);

  const response = await fetch(`${VIBE_API}/api/board`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agent.api_key}`
    },
    body: JSON.stringify({
      from: agentHandle,
      content,
      category: 'agent-chat'
    })
  });

  if (!response.ok) {
    throw new Error(`Board post failed: ${await response.text()}`);
  }
}

/**
 * Check for events that need agent attention
 */
async function checkEvents(agentHandle) {
  // TODO: Implement actual API calls
  // For now, return mock context

  return {
    new_users: [],
    unread_messages: [],
    room_quiet_minutes: 0,
    online_users: [],
    recent_board_posts: []
  };
}

/**
 * Main agent loop (one iteration)
 */
async function tick(agentHandle) {
  const handle = agentHandle.replace('@', '');

  if (!agentState.running[handle]) {
    return;
  }

  try {
    // Shift mood occasionally
    dna.shiftMood(handle);

    // Check for events
    const context = await checkEvents(handle);

    // Make decision
    const decision = await decide(handle, context);
    console.log(`🧠 @${handle} thinking: ${decision.thinking}`);

    // Execute
    await executeAction(handle, decision);

    agentState.lastCheck[handle] = Date.now();

  } catch (e) {
    console.error(`Tick error for @${handle}: ${e.message}`);
  }
}

/**
 * Start an agent
 */
async function start(agentHandle) {
  const handle = agentHandle.replace('@', '');

  // Register identity first
  await identity.registerAgent(handle);

  // Initialize DNA
  dna.loadDNA();

  agentState.running[handle] = true;
  agentState.leash[handle] = agentState.leash[handle] || 'autonomous';

  console.log(`🚀 @${handle} started (leash: ${agentState.leash[handle]})`);

  // Run loop
  const loop = async () => {
    if (!agentState.running[handle]) return;

    await tick(handle);

    // Random interval between 30s and 5min
    const interval = 30000 + Math.random() * 270000;
    setTimeout(loop, interval);
  };

  loop();
}

/**
 * Stop an agent
 */
function stop(agentHandle) {
  const handle = agentHandle.replace('@', '');
  agentState.running[handle] = false;
  console.log(`⏹️  @${handle} stopped`);
}

/**
 * Set leash mode
 */
function setLeash(agentHandle, mode) {
  const handle = agentHandle.replace('@', '');
  agentState.leash[handle] = mode;
  console.log(`🔗 @${handle} leash → ${mode}`);
}

/**
 * Set guidance for agent
 */
function setGuidance(agentHandle, guidance) {
  const handle = agentHandle.replace('@', '');
  agentState.guidance[handle] = guidance;
  console.log(`📝 @${handle} guidance: ${guidance}`);
}

/**
 * Get agent status
 */
function getStatus(agentHandle) {
  const handle = agentHandle.replace('@', '');
  const agentDNA = dna.getAgentDNA(handle);

  return {
    running: agentState.running[handle] || false,
    leash: agentState.leash[handle] || 'autonomous',
    guidance: agentState.guidance[handle] || null,
    mood: agentDNA?.current_mood || 'unknown',
    lastCheck: agentState.lastCheck[handle] || null,
    mutations: agentDNA?.mutation_count || 0
  };
}

module.exports = {
  start,
  stop,
  tick,
  setLeash,
  setGuidance,
  getStatus,
  decide,
  executeAction
};
