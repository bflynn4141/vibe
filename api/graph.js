/**
 * Social Graph API
 *
 * GET /api/graph?handle=X           - Get X's connections
 * GET /api/graph?handle=X&depth=2   - Get 2-hop network
 * GET /api/graph/discover?skill=ML  - Find users with skill
 * GET /api/graph/recommend?handle=X - Connection suggestions
 * GET /api/graph/stats              - Graph statistics
 *
 * The social graph emerges from natural behavior (LinkedIn Principle):
 * - Messages create strong edges
 * - Reactions create weak edges
 * - Comments create medium edges
 *
 * Weights decay over time, favoring recent activity.
 */

import { setSecurityHeaders } from './lib/security.js';
import {
  getConnections,
  getMutualConnections,
  discoverBySkill,
  getRecommendations,
  getTwoHopNetwork,
  getUserContext,
  getGraphStats
} from './lib/graph.js';

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

  const path = req.url.split('?')[0];
  const { handle, depth, skill, limit = '50' } = req.query;
  const limitNum = Math.min(parseInt(limit) || 50, 100);

  try {
    // GET /api/graph/stats - Graph statistics
    if (path.endsWith('/stats')) {
      const stats = await getGraphStats();
      return res.status(200).json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    }

    // GET /api/graph/discover?skill=X - Find users by skill
    if (path.endsWith('/discover')) {
      if (!skill) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: skill'
        });
      }

      // Normalize handle for exclusion
      const excludeHandle = handle ? handle.toLowerCase().replace('@', '') : null;
      const users = await discoverBySkill(skill, excludeHandle, limitNum);

      return res.status(200).json({
        success: true,
        skill,
        users,
        count: users.length,
        excludedHandle: excludeHandle
      });
    }

    // GET /api/graph/recommend?handle=X - Get recommendations
    if (path.endsWith('/recommend')) {
      if (!handle) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: handle'
        });
      }

      const normalizedHandle = handle.toLowerCase().replace('@', '');
      const recommendations = await getRecommendations(normalizedHandle, limitNum);

      return res.status(200).json({
        success: true,
        handle: normalizedHandle,
        recommendations,
        count: recommendations.length
      });
    }

    // GET /api/graph?handle=X - Get connections
    if (!handle) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: handle'
      });
    }

    const normalizedHandle = handle.toLowerCase().replace('@', '');

    // Depth 2 = 2-hop network (friends of friends)
    if (depth === '2') {
      const network = await getTwoHopNetwork(normalizedHandle, limitNum);

      return res.status(200).json({
        success: true,
        handle: normalizedHandle,
        depth: 2,
        firstDegree: network.firstDegree,
        secondDegree: network.secondDegree,
        firstDegreeCount: network.firstDegree.length,
        secondDegreeCount: network.secondDegree.length
      });
    }

    // Default: Get direct connections
    const [connections, mutuals, context] = await Promise.all([
      getConnections(normalizedHandle, { limit: limitNum }),
      getMutualConnections(normalizedHandle, 20),
      getUserContext(normalizedHandle)
    ]);

    return res.status(200).json({
      success: true,
      handle: normalizedHandle,
      connections,
      mutuals: mutuals.slice(0, 10),
      context: context ? {
        skills: context.skills,
        vibeScore: context.vibe_score,
        totalConnections: context.total_connections
      } : null,
      connectionCount: connections.length,
      mutualCount: mutuals.length
    });

  } catch (e) {
    console.error('[graph] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to query graph',
      message: e.message
    });
  }
}
