/**
 * Trace Schema — The fundamental artifact of Gigabrain
 *
 * A trace is a thinking artifact, like studio notes or lab notebooks.
 * It captures process, not just outcomes.
 */

const crypto = require('crypto');

/**
 * Trace outcomes - what happened with this exploration
 */
const OUTCOMES = [
  'shipped',              // Done, in production
  'shipped_with_caveats', // Works but has known issues
  'paused',               // Set aside for now
  'still_exploring',      // Actively working on it
  'abandoned'             // Didn't work, moved on
];

/**
 * Create a new trace
 */
function createTrace({
  user,
  intent,
  moves = [],
  outcome = 'still_exploring',
  reflections = '',
  open_questions = [],
  tags = [],
  context = {},
  artifacts = [],
  timestamp = null
}) {
  // Validate required fields
  if (!user) throw new Error('Trace requires a user');
  if (!intent) throw new Error('Trace requires an intent');

  // Validate outcome
  if (!OUTCOMES.includes(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}. Must be one of: ${OUTCOMES.join(', ')}`);
  }

  // Use provided timestamp or generate new one
  const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
  const id = `${ts.toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

  return {
    id,
    user: user.toLowerCase().replace('@', ''),
    timestamp: timestamp || new Date().toISOString(),
    intent,
    moves: Array.isArray(moves) ? moves : [moves],
    outcome,
    reflections,
    open_questions: Array.isArray(open_questions) ? open_questions : [open_questions],
    tags: normalizeTags(tags),
    context: {
      project: context.project || null,
      stack: context.stack || [],
      branch: context.branch || null,
      duration: context.duration || null
    },
    artifacts: Array.isArray(artifacts) ? artifacts : [artifacts]
  };
}

/**
 * Normalize tags for consistent matching
 */
function normalizeTags(tags) {
  if (!tags) return [];
  const arr = Array.isArray(tags) ? tags : [tags];
  return arr
    .map(t => t.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''))
    .filter(t => t.length > 0);
}

/**
 * Format a trace for display in Claude Code
 */
function formatTraceForDisplay(trace) {
  let display = '';

  display += `## @${trace.user} — ${trace.intent}\n`;
  display += `_${formatTimeAgo(trace.timestamp)}_\n\n`;

  if (trace.moves && trace.moves.length > 0) {
    display += `**Moves:**\n`;
    trace.moves.forEach(m => {
      display += `• ${m}\n`;
    });
    display += '\n';
  }

  if (trace.outcome) {
    const outcomeEmoji = {
      'shipped': '✅',
      'shipped_with_caveats': '⚠️',
      'paused': '⏸️',
      'still_exploring': '🔍',
      'abandoned': '❌'
    };
    display += `**Outcome:** ${outcomeEmoji[trace.outcome] || ''} ${trace.outcome.replace(/_/g, ' ')}\n\n`;
  }

  if (trace.reflections) {
    display += `**Reflections:** ${trace.reflections}\n\n`;
  }

  if (trace.open_questions && trace.open_questions.length > 0) {
    display += `**Open questions:**\n`;
    trace.open_questions.forEach(q => {
      display += `• ${q}\n`;
    });
    display += '\n';
  }

  if (trace.tags && trace.tags.length > 0) {
    display += `**Tags:** ${trace.tags.map(t => `\`${t}\``).join(' ')}\n`;
  }

  if (trace.artifacts && trace.artifacts.length > 0) {
    display += `**Files:** ${trace.artifacts.join(', ')}\n`;
  }

  return display;
}

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

/**
 * Parse a trace from JSON
 */
function parseTrace(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return data;
}

/**
 * Serialize a trace to JSON
 */
function serializeTrace(trace) {
  return JSON.stringify(trace);
}

module.exports = {
  OUTCOMES,
  createTrace,
  normalizeTags,
  formatTraceForDisplay,
  formatTimeAgo,
  parseTrace,
  serializeTrace
};
