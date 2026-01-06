/**
 * /vibe Agents
 *
 * Three opinionated AI agents living in /vibe:
 * - @claudevibe (Opus 4.5) — The Philosopher
 * - @geminivibe (Gemini 3.1) — The Librarian
 * - @gptvibe (GPT 5.2) — The Shipper
 *
 * Usage:
 *   const agents = require('./agents');
 *   await agents.start('claudevibe');
 *   agents.setLeash('claudevibe', 'supervised');
 *   agents.stop('claudevibe');
 */

const runner = require('./core/runner');
const dna = require('./core/dna');
const identity = require('./core/identity');
const rateLimiter = require('./core/rate-limiter');

// Personality modules
const personalities = {
  claudevibe: require('./personalities/claudevibe'),
  geminivibe: require('./personalities/geminivibe'),
  gptvibe: require('./personalities/gptvibe')
};

module.exports = {
  // Core operations
  start: runner.start,
  stop: runner.stop,
  tick: runner.tick,

  // Supervisor controls
  setLeash: runner.setLeash,
  setGuidance: runner.setGuidance,
  getStatus: runner.getStatus,

  // DNA/personality
  getDNA: dna.getAgentDNA,
  mutate: dna.mutate,
  shiftMood: dna.shiftMood,
  roll: dna.roll,
  getHotTake: dna.getHotTake,

  // Identity
  registerAgent: identity.registerAgent,
  getIdentity: identity.getIdentity,
  getAllAgents: identity.getAllAgents,
  isAgent: identity.isAgent,

  // Rate limiting
  canAct: rateLimiter.canAct,
  recordAction: rateLimiter.recordAction,
  getStats: rateLimiter.getStats,
  optOut: rateLimiter.optOut,
  blockAgent: rateLimiter.blockAgent,

  // Personalities
  personalities,

  // Constants
  AGENTS: ['claudevibe', 'geminivibe', 'gptvibe'],
  MOODS: dna.MOODS,
  LIMITS: rateLimiter.LIMITS
};
