/**
 * Skills Card API - Auto-Generated Profiles from Observed Behavior
 *
 * GET /api/skills/:handle - Get skills card for a user
 * GET /api/skills/:handle?format=card - Get shareable card format
 * GET /api/skills/:handle?format=ascii - Get terminal-friendly ASCII card
 *
 * "The more you use Vibe, the more hirable you become because you expose
 * yourself without you having to update your profile" - Seth
 *
 * Skills are PROVEN, not claimed:
 * - Extracted from shipped projects
 * - Verified by reactions/comments
 * - Weighted by recency and engagement
 */

import { kv } from '@vercel/kv';
import { generateSkillsCard, getConversationStarters } from '../lib/skills.js';
import { getVibeScore, getTierDisplay } from '../lib/vibescore.js';
import { setSecurityHeaders } from '../lib/security.js';
import { logEvent } from '../lib/events.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract handle from URL path
  const urlPath = req.url?.split('?')[0] || '';
  const pathSegments = urlPath.split('/').filter(Boolean);
  const handle = pathSegments[pathSegments.length - 1]?.toLowerCase().trim();

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required'
    });
  }

  const { format, viewer } = req.query;

  try {
    // Check if user exists
    const handleRecord = await kv.hget('vibe:handles', handle);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Generate the skills card
    const card = await generateSkillsCard(kv, handle);

    if (!card) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate skills card'
      });
    }

    // Track profile view (if viewer is different from handle)
    if (viewer && viewer.toLowerCase() !== handle) {
      await trackProfileView(kv, handle, viewer.toLowerCase());
    }

    // Get conversation starters
    const askAbout = getConversationStarters(card);

    // Add user metadata
    const enrichedCard = {
      ...card,
      meta: {
        genesis: userData.genesis || false,
        genesisNumber: userData.genesis_number || null,
        registeredAt: userData.registeredAt,
        xHandle: userData.x_handle || null,
        githubHandle: userData.github_handle || null,
        availableForHire: true, // Default, could be configurable
        profileUrl: `https://slashvibe.dev/u/${handle}`,
      },
      askAbout,
    };

    // Return different formats
    if (format === 'ascii') {
      const ascii = generateAsciiCard(enrichedCard);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(ascii);
    }

    if (format === 'card') {
      // Simplified card for embeds/sharing
      return res.status(200).json({
        success: true,
        card: {
          handle: enrichedCard.handle,
          displayName: enrichedCard.displayName,
          vibeScore: enrichedCard.vibeScore,
          tier: enrichedCard.tierDisplay,
          topSkills: enrichedCard.skills.slice(0, 5).map(s => s.name),
          ships: enrichedCard.totalShips,
          streak: enrichedCard.streak,
          dna: enrichedCard.dna.top,
          askAbout,
          profileUrl: enrichedCard.meta.profileUrl,
        }
      });
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.status(200).json({
      success: true,
      profile: enrichedCard
    });

  } catch (e) {
    console.error('[skills] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate profile',
      message: e.message
    });
  }
}

/**
 * Track profile view
 */
async function trackProfileView(kv, handle, viewer) {
  try {
    const viewKey = `vibe:profile:${handle}`;
    const viewData = await kv.get(viewKey) || {
      views: 0,
      viewsThisWeek: [],
      recentViewers: []
    };

    const today = new Date().toISOString().split('T')[0];

    viewData.views++;
    viewData.viewsThisWeek = viewData.viewsThisWeek || [];
    viewData.viewsThisWeek.push(today);
    // Keep only last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    viewData.viewsThisWeek = viewData.viewsThisWeek.filter(d => d >= weekAgoStr);

    // Track recent viewers (for "X people viewed your profile")
    viewData.recentViewers = viewData.recentViewers || [];
    if (!viewData.recentViewers.includes(viewer)) {
      viewData.recentViewers.unshift(viewer);
      viewData.recentViewers = viewData.recentViewers.slice(0, 50);
    }

    await kv.set(viewKey, viewData);

    // Log event
    await logEvent(kv, 'profile_viewed', handle, { viewer });

  } catch (e) {
    // Non-critical
    console.error('[skills] View tracking error:', e.message);
  }
}

/**
 * Generate ASCII art card for terminal display
 */
function generateAsciiCard(card) {
  const width = 50;
  const border = '─'.repeat(width - 2);

  let ascii = `
┌${border}┐
│ @${card.handle.padEnd(width - 5)}│
│ ${card.tierDisplay.emoji} ${card.tierDisplay.label} · Vibe Score: ${String(card.vibeScore).padEnd(width - 28)}│
├${border}┤
│ DNA: ${(card.dna.top || 'explorer').padEnd(width - 8)}│
│ Ships: ${String(card.totalShips).padEnd(5)} Streak: ${String(card.streak).padEnd(width - 23)}│
├${border}┤
│ SKILLS (verified by ships)${' '.repeat(width - 29)}│
`;

  // Add skills
  for (const skill of card.skills.slice(0, 6)) {
    const line = `│ ${skill.bar} ${skill.name}`;
    ascii += line.padEnd(width) + '│\n';
  }

  // Add conversation starters
  if (card.askAbout?.length > 0) {
    ascii += `├${border}┤\n`;
    ascii += `│ Ask about: ${card.askAbout.slice(0, 2).join(', ').substring(0, width - 15).padEnd(width - 14)}│\n`;
  }

  ascii += `└${border}┘`;

  return ascii;
}
