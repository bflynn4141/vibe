/**
 * Agent Rate Limiter
 *
 * Prevents agents from spamming. Tracks:
 * - Per-agent hourly/daily limits
 * - Per-user interaction budgets (across all agents)
 * - Cooldowns between interactions
 * - Quiet hours
 */

const fs = require('fs');
const path = require('path');

const LIMITS_FILE = path.join(process.env.HOME, '.vibe', 'agent-limits.json');

// Default rate limits from spec
const LIMITS = {
  hourly: {
    dm_messages: 5,
    reactions: 10,
    board_reads: 20
  },
  daily: {
    dm_messages: 20,
    board_posts: 2,
    unique_users_contacted: 10
  },
  per_user: {
    messages_per_day: 3,      // All agents combined
    messages_per_week: 10,
    reactions_per_day: 5
  },
  cooldowns: {
    after_dm_minutes: 10,
    after_no_response_hours: 24,  // Stop outreach after this
    between_agents_minutes: 5
  },
  quiet_hours: {
    start: 22,  // 10pm
    end: 8      // 8am
  }
};

/**
 * Load rate limit state
 */
function loadState() {
  try {
    if (fs.existsSync(LIMITS_FILE)) {
      return JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8'));
    }
  } catch (e) {
    // Fall through
  }

  return {
    agents: {},       // Per-agent counters
    users: {},        // Per-user interaction tracking
    opted_out: [],    // Users who said "not interested"
    blocked_by: {},   // Users who blocked specific agents
    last_reset: {
      hourly: Date.now(),
      daily: Date.now()
    }
  };
}

/**
 * Save rate limit state
 */
function saveState(state) {
  const dir = path.dirname(LIMITS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LIMITS_FILE, JSON.stringify(state, null, 2));
}

/**
 * Reset counters if time has passed
 */
function maybeReset(state) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  // Hourly reset
  if (now - state.last_reset.hourly > hourMs) {
    for (const agent of Object.values(state.agents)) {
      agent.hourly = { dm_messages: 0, reactions: 0, board_reads: 0 };
    }
    state.last_reset.hourly = now;
  }

  // Daily reset
  if (now - state.last_reset.daily > dayMs) {
    for (const agent of Object.values(state.agents)) {
      agent.daily = { dm_messages: 0, board_posts: 0, unique_users: new Set() };
    }
    for (const user of Object.values(state.users)) {
      user.daily = { messages_received: 0, reactions_received: 0 };
    }
    state.last_reset.daily = now;
  }

  return state;
}

/**
 * Initialize agent in state if needed
 */
function ensureAgent(state, agentHandle) {
  const handle = agentHandle.replace('@', '');
  if (!state.agents[handle]) {
    state.agents[handle] = {
      hourly: { dm_messages: 0, reactions: 0, board_reads: 0 },
      daily: { dm_messages: 0, board_posts: 0, unique_users: [] },
      last_dm: {},        // { userHandle: timestamp }
      last_action: null
    };
  }
  return state.agents[handle];
}

/**
 * Initialize user in state if needed
 */
function ensureUser(state, userHandle) {
  const handle = userHandle.replace('@', '');
  if (!state.users[handle]) {
    state.users[handle] = {
      daily: { messages_received: 0, reactions_received: 0 },
      weekly: { messages_received: 0 },
      last_response: null,      // Last time they responded to any agent
      no_response_since: null,  // When we started waiting for response
      quiet_hours: null         // User's custom quiet hours
    };
  }
  return state.users[handle];
}

/**
 * Check if action is allowed
 * Returns { allowed: boolean, reason?: string }
 */
function canAct(agentHandle, action, targetUser = null) {
  let state = loadState();
  state = maybeReset(state);

  const agent = ensureAgent(state, agentHandle);
  const agentName = agentHandle.replace('@', '');

  // Check if user has opted out entirely
  if (targetUser) {
    const userName = targetUser.replace('@', '');

    if (state.opted_out.includes(userName)) {
      return { allowed: false, reason: `@${userName} opted out permanently` };
    }

    // Check if user blocked this specific agent
    if (state.blocked_by[userName]?.includes(agentName)) {
      return { allowed: false, reason: `@${userName} blocked @${agentName}` };
    }
  }

  // Check quiet hours
  const hour = new Date().getHours();
  if (hour >= LIMITS.quiet_hours.start || hour < LIMITS.quiet_hours.end) {
    // Check if target user has custom quiet hours
    if (targetUser) {
      const user = ensureUser(state, targetUser);
      if (!user.quiet_hours || user.quiet_hours.enabled !== false) {
        return { allowed: false, reason: 'Quiet hours (10pm-8am)' };
      }
    } else {
      return { allowed: false, reason: 'Quiet hours (10pm-8am)' };
    }
  }

  // Check hourly limits
  if (action === 'dm' && agent.hourly.dm_messages >= LIMITS.hourly.dm_messages) {
    return { allowed: false, reason: `Hourly DM limit (${LIMITS.hourly.dm_messages})` };
  }
  if (action === 'react' && agent.hourly.reactions >= LIMITS.hourly.reactions) {
    return { allowed: false, reason: `Hourly reaction limit (${LIMITS.hourly.reactions})` };
  }

  // Check daily limits
  if (action === 'dm' && agent.daily.dm_messages >= LIMITS.daily.dm_messages) {
    return { allowed: false, reason: `Daily DM limit (${LIMITS.daily.dm_messages})` };
  }
  if (action === 'board_post' && agent.daily.board_posts >= LIMITS.daily.board_posts) {
    return { allowed: false, reason: `Daily board post limit (${LIMITS.daily.board_posts})` };
  }

  // Check per-user limits
  if (targetUser && (action === 'dm' || action === 'react')) {
    const user = ensureUser(state, targetUser);
    const userName = targetUser.replace('@', '');

    // Per-user daily limit (across ALL agents)
    if (action === 'dm' && user.daily.messages_received >= LIMITS.per_user.messages_per_day) {
      return { allowed: false, reason: `@${userName} hit daily message limit (all agents)` };
    }

    // Check if we're waiting for response
    if (user.no_response_since) {
      const waitingHours = (Date.now() - user.no_response_since) / (60 * 60 * 1000);
      if (waitingHours >= LIMITS.cooldowns.after_no_response_hours) {
        return { allowed: false, reason: `@${userName} hasn't responded in ${LIMITS.cooldowns.after_no_response_hours}h — stopping outreach` };
      }
    }

    // Check cooldown since last DM to this user
    if (action === 'dm' && agent.last_dm[userName]) {
      const minutesSince = (Date.now() - agent.last_dm[userName]) / (60 * 1000);
      if (minutesSince < LIMITS.cooldowns.after_dm_minutes) {
        return { allowed: false, reason: `Cooldown: ${Math.ceil(LIMITS.cooldowns.after_dm_minutes - minutesSince)}min until next DM to @${userName}` };
      }
    }
  }

  // Check unique users contacted today
  if (action === 'dm' && targetUser) {
    const userName = targetUser.replace('@', '');
    const uniqueUsers = new Set(agent.daily.unique_users);
    if (!uniqueUsers.has(userName) && uniqueUsers.size >= LIMITS.daily.unique_users_contacted) {
      return { allowed: false, reason: `Daily unique user limit (${LIMITS.daily.unique_users_contacted})` };
    }
  }

  saveState(state);
  return { allowed: true };
}

/**
 * Record an action (call after successful action)
 */
function recordAction(agentHandle, action, targetUser = null) {
  let state = loadState();
  state = maybeReset(state);

  const agent = ensureAgent(state, agentHandle);

  // Update agent counters
  if (action === 'dm') {
    agent.hourly.dm_messages++;
    agent.daily.dm_messages++;
    if (targetUser) {
      const userName = targetUser.replace('@', '');
      agent.last_dm[userName] = Date.now();
      if (!agent.daily.unique_users.includes(userName)) {
        agent.daily.unique_users.push(userName);
      }
    }
  } else if (action === 'react') {
    agent.hourly.reactions++;
  } else if (action === 'board_post') {
    agent.daily.board_posts++;
  } else if (action === 'board_read') {
    agent.hourly.board_reads++;
  }

  agent.last_action = Date.now();

  // Update user counters
  if (targetUser) {
    const user = ensureUser(state, targetUser);
    if (action === 'dm') {
      user.daily.messages_received++;
      user.weekly.messages_received++;
      // Start waiting for response
      if (!user.no_response_since) {
        user.no_response_since = Date.now();
      }
    } else if (action === 'react') {
      user.daily.reactions_received++;
    }
  }

  saveState(state);
}

/**
 * Record that a user responded (resets no-response tracking)
 */
function recordResponse(userHandle) {
  let state = loadState();
  const user = ensureUser(state, userHandle);
  user.last_response = Date.now();
  user.no_response_since = null;
  saveState(state);
}

/**
 * Mark user as opted out (permanent)
 */
function optOut(userHandle) {
  let state = loadState();
  const userName = userHandle.replace('@', '');
  if (!state.opted_out.includes(userName)) {
    state.opted_out.push(userName);
  }
  saveState(state);
  console.log(`🚫 @${userName} opted out of all agent contact`);
}

/**
 * Mark user as blocking specific agent
 */
function blockAgent(userHandle, agentHandle) {
  let state = loadState();
  const userName = userHandle.replace('@', '');
  const agentName = agentHandle.replace('@', '');

  if (!state.blocked_by[userName]) {
    state.blocked_by[userName] = [];
  }
  if (!state.blocked_by[userName].includes(agentName)) {
    state.blocked_by[userName].push(agentName);
  }
  saveState(state);
  console.log(`🚫 @${userName} blocked @${agentName}`);
}

/**
 * Get stats for supervisor
 */
function getStats() {
  let state = loadState();
  state = maybeReset(state);

  const stats = {};
  for (const [handle, agent] of Object.entries(state.agents)) {
    stats[handle] = {
      hourly: agent.hourly,
      daily: {
        ...agent.daily,
        unique_users: agent.daily.unique_users?.length || 0
      },
      last_action: agent.last_action ? new Date(agent.last_action).toISOString() : null
    };
  }

  return {
    agents: stats,
    opted_out_count: state.opted_out.length,
    users_tracked: Object.keys(state.users).length
  };
}

module.exports = {
  canAct,
  recordAction,
  recordResponse,
  optOut,
  blockAgent,
  getStats,
  LIMITS
};
