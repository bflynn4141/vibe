/**
 * Tools — The 3 MCP tools for Gigabrain
 *
 * gigabrain_explore — Search terrain, return traces with patterns/experts
 * gigabrain_trace   — Publish a thinking artifact (manual, high quality)
 * gigabrain_who     — See who's building what (recent traces)
 */

const { createTrace, formatTraceForDisplay, OUTCOMES } = require('./trace-schema');
const { queryTraces, appendTrace, getActiveUsers, getStats } = require('./store');
const { getCurrentContext, contextToTags, formatContext } = require('./context');

/**
 * Tool definitions for MCP
 */
const toolDefinitions = [
  {
    name: 'gigabrain_explore',
    description: `Search the collective memory for related thinking. Use when:
- Starting work on a new problem
- Wondering if others have explored similar terrain
- Looking for approaches others have tried

Returns traces (thinking artifacts) from other builders who've explored related territory.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What terrain are you exploring? (e.g., "token distribution", "supabase RLS", "auction mechanics")'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific technology or domain tags to filter by'
        }
      },
      required: ['query']
    }
  },

  {
    name: 'gigabrain_trace',
    description: `Leave a thinking artifact for others to find. A trace captures:
- What you were trying to do (intent)
- What paths you explored (moves)
- What happened (outcome)
- What you learned or wonder about (reflections, open questions)

This is for sharing process, not just outcomes. Like studio notes or lab notebooks.`,
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'What were you trying to do? (one sentence)'
        },
        moves: {
          type: 'array',
          items: { type: 'string' },
          description: 'What paths did you explore? (list of approaches/attempts)'
        },
        outcome: {
          type: 'string',
          enum: OUTCOMES,
          description: 'What happened? shipped | shipped_with_caveats | paused | still_exploring | abandoned'
        },
        reflections: {
          type: 'string',
          description: 'What did you learn? What felt promising or brittle?'
        },
        open_questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'What are you still unsure about?'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for discovery (technologies, concepts, domains)'
        }
      },
      required: ['intent', 'moves', 'outcome']
    }
  },

  {
    name: 'gigabrain_who',
    description: `See who's been building and what they're exploring.
Shows recent traces from other builders in the collective.`,
    inputSchema: {
      type: 'object',
      properties: {
        since: {
          type: 'string',
          description: 'How far back to look? Default: 24h. Options: 1h, 24h, 7d, 30d'
        }
      }
    }
  }
];

/**
 * Handle gigabrain_explore
 */
async function handleExplore(args, config) {
  const { query, tags = [] } = args;

  // Get current context for auto-tags
  const context = getCurrentContext();
  const autoTags = contextToTags(context);

  // Combine explicit tags with auto-detected
  const allTags = [...new Set([...tags, ...autoTags])];

  // Query the store
  const results = queryTraces({
    tags: allTags,
    text: query,
    limit: 5,
    minScore: 0.1
  });

  // Build response
  let display = `## Exploring: "${query}"\n\n`;

  if (context.project) {
    display += `_Current context: ${context.project}`;
    if (context.stack.length > 0) {
      display += ` (${context.stack.slice(0, 3).join(', ')})`;
    }
    display += `_\n\n`;
  }

  if (results.length === 0) {
    display += `No traces found in this terrain yet.\n\n`;
    display += `Be the first to leave a trace with \`gigabrain_trace\`.\n`;
  } else {
    display += `### ${results.length} Related Trace${results.length > 1 ? 's' : ''}\n\n`;

    results.forEach((result, i) => {
      display += `---\n\n`;
      display += formatTraceForDisplay(result.trace);
      display += '\n';
    });

    // Show unique users
    const users = [...new Set(results.map(r => r.trace.user))];
    if (users.length > 0) {
      display += `---\n\n`;
      display += `**Builders in this terrain:** ${users.map(u => `@${u}`).join(', ')}\n`;
    }
  }

  return {
    display,
    results: results.map(r => r.trace),
    context,
    tags: allTags
  };
}

/**
 * Handle gigabrain_trace
 */
async function handleTrace(args, config) {
  const {
    intent,
    moves,
    outcome,
    reflections = '',
    open_questions = [],
    tags = []
  } = args;

  // Get context
  const context = getCurrentContext();
  const autoTags = contextToTags(context);

  // Merge auto-tags with explicit tags
  const allTags = [...new Set([...tags, ...autoTags])];

  // Get username from config
  const username = config.username || 'anonymous';

  // Create the trace
  const trace = createTrace({
    user: username,
    intent,
    moves,
    outcome,
    reflections,
    open_questions,
    tags: allTags,
    context: {
      project: context.project,
      stack: context.stack,
      branch: context.branch
    },
    artifacts: context.recentFiles
  });

  // Store it
  appendTrace(trace);

  // Build response
  let display = `## Trace Published\n\n`;
  display += `Your thinking is now part of the collective memory.\n\n`;
  display += `---\n\n`;
  display += formatTraceForDisplay(trace);
  display += `\n---\n\n`;
  display += `Others exploring ${allTags.slice(0, 3).map(t => `\`${t}\``).join(', ')} will find this.\n`;

  return {
    success: true,
    display,
    trace
  };
}

/**
 * Handle gigabrain_who
 */
async function handleWho(args, config) {
  const { since = '24h' } = args;

  // Parse since
  const sinceMs = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  const cutoff = Date.now() - (sinceMs[since] || sinceMs['24h']);

  // Get active users
  const users = getActiveUsers(new Date(cutoff).toISOString());
  const stats = getStats();

  // Build response
  let display = `## Who's Building\n\n`;

  if (users.length === 0) {
    display += `_No traces in the last ${since}._\n\n`;
    display += `Be the first to leave a trace with \`gigabrain_trace\`.\n`;
  } else {
    display += `### ${users.length} Builder${users.length > 1 ? 's' : ''} Active\n\n`;

    users.forEach(user => {
      const timeAgo = formatTimeAgo(user.lastTrace);
      display += `**@${user.username}** — ${user.recentIntent}\n`;
      display += `_${user.traceCount} trace${user.traceCount > 1 ? 's' : ''} · last active ${timeAgo}_\n\n`;
    });
  }

  // Add stats
  display += `---\n\n`;
  display += `**Collective:** ${stats.totalTraces} traces from ${stats.uniqueUsers} builders\n`;

  if (stats.topTags && stats.topTags.length > 0) {
    display += `**Hot terrain:** ${stats.topTags.slice(0, 5).map(t => `\`${t.tag}\``).join(', ')}\n`;
  }

  return {
    display,
    users,
    stats
  };
}

function formatTimeAgo(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Route tool calls
 */
async function handleToolCall(name, args, config) {
  switch (name) {
    case 'gigabrain_explore':
      return await handleExplore(args, config);
    case 'gigabrain_trace':
      return await handleTrace(args, config);
    case 'gigabrain_who':
      return await handleWho(args, config);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

module.exports = {
  toolDefinitions,
  handleToolCall
};
