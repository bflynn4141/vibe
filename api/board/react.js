/**
 * Board Reactions API
 *
 * POST /api/board/react - Add/remove a reaction to a board entry
 *
 * Body: { entryId, handle, reaction }
 *
 * Supported reactions: fire, ship, heart, mind_blown, eyes, rocket
 *
 * "Lowest-friction engagement - tap to react without composing a message"
 */

import { kv } from '@vercel/kv';

// Supported reaction types with emoji mapping
const REACTIONS = {
  fire: '🔥',
  ship: '🚢',
  heart: '❤️',
  mind_blown: '🤯',
  eyes: '👀',
  rocket: '🚀',
  clap: '👏',
  hundred: '💯'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { entryId, handle, reaction } = req.body;

  // Validate inputs
  if (!entryId) {
    return res.status(400).json({
      success: false,
      error: 'entryId required'
    });
  }

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'handle required'
    });
  }

  if (!reaction || !REACTIONS[reaction]) {
    return res.status(400).json({
      success: false,
      error: 'Invalid reaction',
      valid_reactions: Object.keys(REACTIONS)
    });
  }

  const normalizedHandle = handle.toLowerCase().trim();

  try {
    // Get the entry
    const entry = await kv.get(`board:entry:${entryId}`);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }

    // Initialize reactions object if needed
    const reactions = entry.reactions || {};

    // Initialize this reaction type if needed
    if (!reactions[reaction]) {
      reactions[reaction] = [];
    }

    // Toggle reaction (add if not present, remove if present)
    const userIndex = reactions[reaction].indexOf(normalizedHandle);
    let action;

    if (userIndex === -1) {
      // Add reaction
      reactions[reaction].push(normalizedHandle);
      action = 'added';
    } else {
      // Remove reaction
      reactions[reaction].splice(userIndex, 1);
      action = 'removed';
      // Clean up empty arrays
      if (reactions[reaction].length === 0) {
        delete reactions[reaction];
      }
    }

    // Update entry
    entry.reactions = reactions;
    await kv.set(`board:entry:${entryId}`, entry);

    // Notify post author of reaction (unless they're reacting to themselves)
    if (action === 'added' && entry.author !== normalizedHandle) {
      try {
        const MESSAGES_KEY = 'vibe:messages';
        const messages = await kv.get(MESSAGES_KEY) || [];

        messages.push({
          id: `notif_${Date.now().toString(36)}`,
          from: 'vibe',
          to: entry.author,
          text: `${REACTIONS[reaction]} @${normalizedHandle} reacted to your ship: "${(entry.content || '').substring(0, 50)}${(entry.content || '').length > 50 ? '...' : ''}"`,
          createdAt: new Date().toISOString(),
          read: false,
          type: 'reaction_notification'
        });

        // Keep last 10k messages
        if (messages.length > 10000) {
          messages.splice(0, messages.length - 10000);
        }

        await kv.set(MESSAGES_KEY, messages);
      } catch (notifErr) {
        console.error('[board/react] Notification error:', notifErr.message);
        // Non-critical, continue
      }
    }

    // Calculate total reactions for this entry
    const totalReactions = Object.values(reactions).reduce(
      (sum, users) => sum + users.length,
      0
    );

    // Return updated reactions
    return res.status(200).json({
      success: true,
      action,
      reaction,
      emoji: REACTIONS[reaction],
      entryId,
      reactions: Object.entries(reactions).map(([type, users]) => ({
        type,
        emoji: REACTIONS[type],
        count: users.length,
        users,
        userReacted: users.includes(normalizedHandle)
      })),
      totalReactions
    });

  } catch (e) {
    console.error('[board/react] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to add reaction',
      message: e.message
    });
  }
}
