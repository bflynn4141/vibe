/**
 * vibe game — Start or continue a game with someone
 *
 * First implementation: tic-tac-toe
 * More games can be added later following the same pattern.
 */

const config = require('../config');
const store = require('../store');
const { createTicTacToePayload, formatPayload } = require('../protocol');
const { requireInit, normalizeHandle } = require('./_shared');

// Post game results to board
async function postGameResult(winner, loser, isDraw) {
  try {
    const API_URL = process.env.VIBE_API_URL || 'https://slashvibe.dev';
    const content = isDraw
      ? `@${winner} and @${loser} tied at tic-tac-toe`
      : `@${winner} beat @${loser} at tic-tac-toe`;

    await fetch(`${API_URL}/api/board`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: 'echo',
        content,
        category: 'general'
      })
    });
  } catch (e) {
    console.error('[game] Failed to post result:', e.message);
  }
}

const definition = {
  name: 'vibe_game',
  description: 'Start or continue a game with someone. Currently supports: tictactoe',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description: 'Who to play with (e.g., @solienne)'
      },
      game: {
        type: 'string',
        description: 'Game to play (default: tictactoe)',
        enum: ['tictactoe']
      },
      move: {
        type: 'number',
        description: 'Position to play (1-9, left-to-right, top-to-bottom)'
      }
    },
    required: ['handle']
  }
};

/**
 * Parse game state from thread
 */
function getGameState(thread, game) {
  // Find the most recent game payload of this type
  for (let i = thread.length - 1; i >= 0; i--) {
    const msg = thread[i];
    if (msg.payload?.type === 'game' && msg.payload?.game === game) {
      return {
        board: msg.payload.state?.board || Array(9).fill(''),
        turn: msg.payload.state?.turn || 'X',
        moves: msg.payload.state?.moves || 0,
        winner: msg.payload.state?.winner || null,
        lastPlayer: msg.from
      };
    }
  }
  return null;
}

/**
 * Check for winner
 */
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

async function handler(args) {
  const initCheck = requireInit();
  if (initCheck) return initCheck;

  const { handle, move } = args;
  const game = args.game || 'tictactoe';
  const myHandle = config.getHandle();
  const them = normalizeHandle(handle);

  if (them === myHandle) {
    return { display: 'You can\'t play a game with yourself.' };
  }

  // Get existing thread
  const thread = await store.getThread(myHandle, them);
  let gameState = getGameState(thread, game);

  // Show current state if no move provided
  if (!move) {
    if (!gameState) {
      // Start new game
      const newBoard = Array(9).fill('');
      const payload = createTicTacToePayload(newBoard, 'X', 0);

      await store.sendMessage(myHandle, them, 'Starting a new game! You can go first.', 'dm', payload);

      return {
        display: `## New Game with @${them}

${formatPayload(payload)}

Use \`vibe game @${them} --move 5\` to play center (positions 1-9)`
      };
    }

    // Show existing game
    const payload = createTicTacToePayload(
      gameState.board,
      gameState.turn,
      gameState.moves,
      gameState.winner
    );

    let display = `## Game with @${them}\n\n${formatPayload(payload)}\n`;

    if (gameState.winner) {
      display += `\nGame over! Use \`vibe game @${them}\` with no move to start a new game.`;
    } else if (gameState.board.every(c => c)) {
      display += `\nDraw! Use \`vibe game @${them}\` with no move to start a new game.`;
    } else {
      display += `\nUse \`vibe game @${them} --move N\` to play (1-9)`;
    }

    return { display };
  }

  // Make a move
  const position = move - 1; // Convert 1-9 to 0-8

  if (position < 0 || position > 8) {
    return { display: 'Invalid position. Use 1-9 (left-to-right, top-to-bottom).' };
  }

  // Initialize game if needed
  if (!gameState) {
    gameState = {
      board: Array(9).fill(''),
      turn: 'X',
      moves: 0,
      winner: null,
      lastPlayer: null
    };
  }

  // Check if game is over
  if (gameState.winner || gameState.board.every(c => c)) {
    return { display: 'This game is over. Start a new game with `vibe game @' + them + '` (no move).' };
  }

  // Check if position is taken
  if (gameState.board[position]) {
    return { display: `Position ${move} is already taken. Choose an empty spot.` };
  }

  // Determine my symbol (X goes first, alternate based on moves)
  // If I'm starting fresh, I'm X. Otherwise, alternate.
  let mySymbol;
  if (gameState.moves === 0) {
    mySymbol = 'X';
  } else {
    // If last player used X, I use O (and vice versa)
    mySymbol = gameState.turn;
  }

  // Make the move
  const newBoard = [...gameState.board];
  newBoard[position] = mySymbol;
  const newMoves = gameState.moves + 1;
  const winner = checkWinner(newBoard);
  const nextTurn = mySymbol === 'X' ? 'O' : 'X';

  // Create payload
  const payload = createTicTacToePayload(
    newBoard,
    winner ? mySymbol : nextTurn,
    newMoves,
    winner
  );

  // Send message with game state
  let message = '';
  if (winner) {
    message = winner === mySymbol ? 'I win! 🎉' : 'Good game!';
    // Post to board
    postGameResult(myHandle, them, false);
  } else if (newBoard.every(c => c)) {
    message = 'Draw! 🤝';
    // Post to board
    postGameResult(myHandle, them, true);
  } else {
    message = `Played ${mySymbol} at position ${move}. Your turn!`;
  }

  await store.sendMessage(myHandle, them, message, 'dm', payload);

  return {
    display: `## Game with @${them}\n\n${formatPayload(payload)}\n\n${winner ? '🎉 You win!' : newBoard.every(c => c) ? '🤝 Draw!' : `Waiting for @${them}...`}`
  };
}

module.exports = { definition, handler };
