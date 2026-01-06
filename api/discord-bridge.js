/**
 * Discord Bridge API
 *
 * Server-side Discord webhook integration.
 * Posts /vibe activity to Discord channel.
 *
 * POST /api/discord-bridge - Post an event to Discord
 *
 * Env: DISCORD_WEBHOOK_URL
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Spirit blue color
const COLORS = {
  join: 0x6B8FFF,    // Blue - new user
  idea: 0xF1C40F,    // Yellow - ideas
  game: 0x2ECC71,    // Green - game results
  digest: 0x9B59B6,  // Purple - daily digest
  board: 0xE74C3C,   // Red - board posts
  default: 0x6B8FFF
};

/**
 * Post to Discord webhook
 */
async function postToDiscord(embed) {
  if (!WEBHOOK_URL) {
    console.log('[discord-bridge] No webhook URL configured');
    return false;
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '/vibe',
        avatar_url: 'https://slashvibe.dev/vibe-icon.png',
        embeds: [embed]
      })
    });

    if (!response.ok) {
      console.error('[discord-bridge] Webhook failed:', response.status);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[discord-bridge] Error:', e.message);
    return false;
  }
}

/**
 * Format events for Discord
 */
function formatEvent(type, data) {
  const timestamp = new Date().toISOString();

  switch (type) {
    case 'join':
      return {
        color: COLORS.join,
        title: `@${data.handle} joined /vibe`,
        description: data.building || 'Building something cool',
        footer: { text: 'slashvibe.dev' },
        timestamp
      };

    case 'idea':
      return {
        color: COLORS.idea,
        title: '💡 New idea',
        description: data.handle
          ? `**@${data.handle}** has an idea:\n\n${data.content}`
          : data.content,
        footer: { text: 'Share yours: vibe echo "idea: ..."' },
        timestamp
      };

    case 'game':
      const gameDesc = data.draw
        ? `🤝 **@${data.player1}** and **@${data.player2}** tied at ${data.game}`
        : `🎮 **@${data.winner}** beat **@${data.loser}** at ${data.game}`;
      return {
        color: COLORS.game,
        description: gameDesc,
        timestamp
      };

    case 'digest':
      return {
        color: COLORS.digest,
        title: '📊 Daily /vibe digest',
        description: data.content,
        footer: { text: 'slashvibe.dev' },
        timestamp
      };

    case 'board':
      return {
        color: COLORS.board,
        title: '📋 Board post',
        description: data.handle
          ? `**@${data.handle}**: ${data.content}`
          : data.content,
        footer: { text: 'See more: vibe board' },
        timestamp
      };

    default:
      return {
        color: COLORS.default,
        description: data.content || data.message || 'Something happened in /vibe',
        timestamp
      };
  }
}

/**
 * API Handler
 */
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

  const { type, data } = req.body;

  if (!type || !data) {
    return res.status(400).json({ error: 'type and data required' });
  }

  const embed = formatEvent(type, data);
  const success = await postToDiscord(embed);

  return res.status(200).json({
    success,
    bridged: !!WEBHOOK_URL,
    type
  });
}
