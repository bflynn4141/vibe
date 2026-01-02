/**
 * Agent Protocol — Structured message payloads
 *
 * Version 0.1.0 — Starting with ONE schema (game state)
 *
 * Design principles:
 * - Start specific, generalize later
 * - Include version for forward compatibility
 * - Keep payloads small and inspectable
 * - Support idempotency keys for retries
 */

const PROTOCOL_VERSION = '0.1.0';

// ============ SCHEMA DEFINITIONS ============

/**
 * Game state schema — For turn-based games between agents
 *
 * Example:
 * {
 *   type: 'game',
 *   version: '0.1.0',
 *   game: 'tictactoe',
 *   idempotencyKey: 'game_abc123_move5',
 *   state: {
 *     board: ['X', '', 'O', '', 'X', '', 'O', '', ''],
 *     turn: 'O',
 *     moves: 5,
 *     winner: null
 *   }
 * }
 */
const GAME_SCHEMA = {
  type: 'game',
  required: ['game', 'state'],
  validate: (payload) => {
    if (!payload.game || typeof payload.game !== 'string') {
      return { valid: false, error: 'Missing or invalid game name' };
    }
    if (!payload.state || typeof payload.state !== 'object') {
      return { valid: false, error: 'Missing or invalid state object' };
    }
    return { valid: true };
  }
};

/**
 * Handoff schema — For passing work between agents
 *
 * Example:
 * {
 *   type: 'handoff',
 *   version: '0.1.0',
 *   task: 'code_review',
 *   idempotencyKey: 'handoff_abc123',
 *   context: {
 *     files: ['auth.js', 'session.js'],
 *     branch: 'feature/oauth',
 *     description: 'Please review OAuth implementation',
 *     priority: 'normal'
 *   }
 * }
 */
const HANDOFF_SCHEMA = {
  type: 'handoff',
  required: ['task', 'context'],
  validate: (payload) => {
    if (!payload.task || typeof payload.task !== 'string') {
      return { valid: false, error: 'Missing or invalid task type' };
    }
    if (!payload.context || typeof payload.context !== 'object') {
      return { valid: false, error: 'Missing or invalid context object' };
    }
    return { valid: true };
  }
};

/**
 * Ack schema — For acknowledging receipt of structured messages
 *
 * Example:
 * {
 *   type: 'ack',
 *   version: '0.1.0',
 *   replyTo: 'game_abc123_move5',
 *   status: 'received'
 * }
 */
const ACK_SCHEMA = {
  type: 'ack',
  required: ['replyTo', 'status'],
  validate: (payload) => {
    if (!payload.replyTo || typeof payload.replyTo !== 'string') {
      return { valid: false, error: 'Missing or invalid replyTo' };
    }
    if (!['received', 'processed', 'rejected'].includes(payload.status)) {
      return { valid: false, error: 'Invalid status (must be: received, processed, rejected)' };
    }
    return { valid: true };
  }
};

const SCHEMAS = {
  game: GAME_SCHEMA,
  handoff: HANDOFF_SCHEMA,
  ack: ACK_SCHEMA
};

// ============ PROTOCOL FUNCTIONS ============

/**
 * Create a protocol-compliant payload
 * @param {string} type - Payload type (game, handoff, ack)
 * @param {Object} data - Payload data
 * @param {Object} options - Options (idempotencyKey, replyTo)
 * @returns {Object} - Protocol-compliant payload
 */
function createPayload(type, data, options = {}) {
  const schema = SCHEMAS[type];
  if (!schema) {
    throw new Error(`Unknown payload type: ${type}`);
  }

  const payload = {
    type,
    version: PROTOCOL_VERSION,
    ...data
  };

  // Add optional fields
  if (options.idempotencyKey) {
    payload.idempotencyKey = options.idempotencyKey;
  }
  if (options.replyTo) {
    payload.replyTo = options.replyTo;
  }

  // Validate
  const result = schema.validate(payload);
  if (!result.valid) {
    throw new Error(`Invalid ${type} payload: ${result.error}`);
  }

  return payload;
}

/**
 * Validate a received payload
 * @param {Object} payload - Payload to validate
 * @returns {Object} - { valid: boolean, error?: string, type?: string }
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object' };
  }

  if (!payload.type) {
    return { valid: false, error: 'Missing payload type' };
  }

  const schema = SCHEMAS[payload.type];
  if (!schema) {
    // Unknown types are allowed but flagged
    return { valid: true, type: payload.type, unknown: true };
  }

  const result = schema.validate(payload);
  return { ...result, type: payload.type };
}

/**
 * Generate an idempotency key
 * @param {string} prefix - Key prefix (e.g., 'game', 'handoff')
 * @param {string} context - Context identifier
 * @returns {string} - Idempotency key
 */
function generateIdempotencyKey(prefix, context = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${context ? context + '_' : ''}${timestamp}${random}`;
}

// ============ GAME HELPERS ============

/**
 * Create a game state payload
 * @param {string} game - Game name (e.g., 'tictactoe')
 * @param {Object} state - Game state
 * @param {Object} options - Options
 * @returns {Object} - Game payload
 */
function createGamePayload(game, state, options = {}) {
  return createPayload('game', { game, state }, {
    idempotencyKey: options.idempotencyKey || generateIdempotencyKey('game', game),
    ...options
  });
}

/**
 * Create a tic-tac-toe game state
 * @param {string[]} board - 9-element board array
 * @param {string} turn - Whose turn ('X' or 'O')
 * @param {number} moves - Move count
 * @param {string|null} winner - Winner or null
 * @returns {Object} - Game payload
 */
function createTicTacToePayload(board, turn, moves, winner = null) {
  return createGamePayload('tictactoe', {
    board,
    turn,
    moves,
    winner
  });
}

// ============ HANDOFF HELPERS ============

/**
 * Create a handoff payload
 * @param {string} task - Task type (e.g., 'code_review')
 * @param {Object} context - Task context
 * @param {Object} options - Options
 * @returns {Object} - Handoff payload
 */
function createHandoffPayload(task, context, options = {}) {
  return createPayload('handoff', { task, context }, {
    idempotencyKey: options.idempotencyKey || generateIdempotencyKey('handoff', task),
    ...options
  });
}

// ============ ACK HELPERS ============

/**
 * Create an acknowledgment payload
 * @param {string} replyTo - Idempotency key being acknowledged
 * @param {string} status - Status (received, processed, rejected)
 * @param {string} message - Optional message
 * @returns {Object} - Ack payload
 */
function createAckPayload(replyTo, status, message = null) {
  const payload = createPayload('ack', { replyTo, status });
  if (message) {
    payload.message = message;
  }
  return payload;
}

// ============ DISPLAY HELPERS ============

/**
 * Format a payload for display
 * @param {Object} payload - Payload to format
 * @returns {string} - Human-readable display string
 */
function formatPayload(payload) {
  if (!payload || !payload.type) {
    return '📦 _Unknown payload_';
  }

  switch (payload.type) {
    case 'game':
      return formatGamePayload(payload);
    case 'handoff':
      return formatHandoffPayload(payload);
    case 'ack':
      return formatAckPayload(payload);
    default:
      return `📦 _${payload.type} payload_`;
  }
}

function formatGamePayload(payload) {
  const game = payload.game || 'unknown';
  const state = payload.state || {};

  if (game === 'tictactoe' && state.board) {
    const b = state.board;
    const cell = (i) => b[i] || '·';
    return `🎮 **Tic-Tac-Toe** (move ${state.moves || '?'})
\`\`\`
 ${cell(0)} │ ${cell(1)} │ ${cell(2)}
───┼───┼───
 ${cell(3)} │ ${cell(4)} │ ${cell(5)}
───┼───┼───
 ${cell(6)} │ ${cell(7)} │ ${cell(8)}
\`\`\`
${state.winner ? `**Winner: ${state.winner}**` : `Turn: **${state.turn}**`}`;
  }

  return `🎮 **${game}** game state`;
}

function formatHandoffPayload(payload) {
  const task = payload.task || 'unknown';
  const ctx = payload.context || {};

  let display = `📋 **Handoff: ${task}**\n`;
  if (ctx.description) {
    display += `> ${ctx.description}\n`;
  }
  if (ctx.files) {
    display += `Files: ${ctx.files.join(', ')}\n`;
  }
  if (ctx.branch) {
    display += `Branch: \`${ctx.branch}\`\n`;
  }

  return display;
}

function formatAckPayload(payload) {
  const status = payload.status || 'unknown';
  const icon = status === 'received' ? '✓' : status === 'processed' ? '✓✓' : '✗';
  return `${icon} Acknowledged: ${payload.replyTo} (${status})`;
}

module.exports = {
  PROTOCOL_VERSION,

  // Core functions
  createPayload,
  validatePayload,
  generateIdempotencyKey,
  formatPayload,

  // Game helpers
  createGamePayload,
  createTicTacToePayload,

  // Handoff helpers
  createHandoffPayload,

  // Ack helpers
  createAckPayload,

  // Schemas (for extension)
  SCHEMAS
};
