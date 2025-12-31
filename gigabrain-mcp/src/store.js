/**
 * Store — Local JSONL storage for traces
 *
 * Append-only file: ~/.vibe/gigabrain.jsonl
 * Query methods: byTags, byText, recent, byUser, byOutcome
 * Scoring: tag overlap + keyword match + recency
 */

const fs = require('fs');
const path = require('path');
const { parseTrace, normalizeTags, formatTimeAgo } = require('./trace-schema');

const VIBE_DIR = path.join(process.env.HOME, '.vibe');
const STORE_FILE = path.join(VIBE_DIR, 'gigabrain.jsonl');

/**
 * Ensure the store directory exists
 */
function ensureStore() {
  if (!fs.existsSync(VIBE_DIR)) {
    fs.mkdirSync(VIBE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, '');
  }
}

/**
 * Append a trace to the store
 */
function appendTrace(trace) {
  ensureStore();
  const line = JSON.stringify(trace) + '\n';
  fs.appendFileSync(STORE_FILE, line);
  return trace;
}

/**
 * Read all traces from the store
 */
function readAllTraces() {
  ensureStore();
  const content = fs.readFileSync(STORE_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.length > 0);
  return lines.map(line => {
    try {
      return parseTrace(line);
    } catch (e) {
      return null;
    }
  }).filter(t => t !== null);
}

/**
 * Query traces with scoring
 * Returns traces sorted by relevance score
 */
function queryTraces({
  tags = [],
  text = '',
  user = null,
  outcome = null,
  limit = 10,
  minScore = 0.1
}) {
  const traces = readAllTraces();
  const normalizedTags = normalizeTags(tags);
  const keywords = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Score each trace
  const scored = traces.map(trace => {
    let score = 0;

    // Tag overlap (0-1, weighted heavily)
    if (normalizedTags.length > 0) {
      const traceTags = new Set(trace.tags || []);
      const matches = normalizedTags.filter(t => traceTags.has(t)).length;
      score += (matches / normalizedTags.length) * 0.5;
    }

    // Keyword match in intent, moves, reflections (0-0.3)
    if (keywords.length > 0) {
      const searchText = [
        trace.intent || '',
        ...(trace.moves || []),
        trace.reflections || '',
        ...(trace.open_questions || [])
      ].join(' ').toLowerCase();

      const matches = keywords.filter(kw => searchText.includes(kw)).length;
      score += (matches / keywords.length) * 0.3;
    }

    // Recency boost (0-0.2)
    const age = Date.now() - new Date(trace.timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (age < dayMs) score += 0.2;        // Today
    else if (age < 7 * dayMs) score += 0.15;  // This week
    else if (age < 30 * dayMs) score += 0.1;  // This month
    else score += 0.05;                    // Older

    // Filter by user if specified
    if (user && trace.user !== user.toLowerCase().replace('@', '')) {
      return null;
    }

    // Filter by outcome if specified
    if (outcome && trace.outcome !== outcome) {
      return null;
    }

    return { trace, score };
  })
    .filter(r => r !== null && r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/**
 * Get recent traces
 */
function getRecentTraces(limit = 10) {
  const traces = readAllTraces();
  return traces
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Get traces by user
 */
function getTracesByUser(user, limit = 10) {
  const username = user.toLowerCase().replace('@', '');
  const traces = readAllTraces();
  return traces
    .filter(t => t.user === username)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Get unique users who have left traces
 */
function getActiveUsers(since = null) {
  const traces = readAllTraces();
  const cutoff = since ? new Date(since).getTime() : Date.now() - 24 * 60 * 60 * 1000;

  const users = {};
  traces.forEach(t => {
    const ts = new Date(t.timestamp).getTime();
    if (ts >= cutoff) {
      if (!users[t.user]) {
        users[t.user] = {
          username: t.user,
          lastTrace: t.timestamp,
          traceCount: 0,
          recentIntent: t.intent
        };
      }
      users[t.user].traceCount++;
      if (new Date(t.timestamp) > new Date(users[t.user].lastTrace)) {
        users[t.user].lastTrace = t.timestamp;
        users[t.user].recentIntent = t.intent;
      }
    }
  });

  return Object.values(users)
    .sort((a, b) => new Date(b.lastTrace) - new Date(a.lastTrace));
}

/**
 * Get store stats
 */
function getStats() {
  const traces = readAllTraces();
  const users = new Set(traces.map(t => t.user));
  const tags = {};
  traces.forEach(t => {
    (t.tags || []).forEach(tag => {
      tags[tag] = (tags[tag] || 0) + 1;
    });
  });

  const topTags = Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalTraces: traces.length,
    uniqueUsers: users.size,
    topTags,
    oldestTrace: traces.length > 0 ? traces[0].timestamp : null,
    newestTrace: traces.length > 0 ? traces[traces.length - 1].timestamp : null
  };
}

module.exports = {
  STORE_FILE,
  ensureStore,
  appendTrace,
  readAllTraces,
  queryTraces,
  getRecentTraces,
  getTracesByUser,
  getActiveUsers,
  getStats
};
