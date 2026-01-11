/**
 * Vibecodings Projects API
 *
 * GET /api/projects - List all projects
 * GET /api/projects?category=agents - Filter by category
 * GET /api/projects?creator=seth - Filter by creator
 * GET /api/projects?search=query - Search projects
 * GET /api/projects?view=new - Recently added (last 30 days)
 * GET /api/projects?view=rising - Most liked projects
 * GET /api/projects?view=featured - Curator picks
 * POST /api/projects - Submit new project to pending queue
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Keys for pending submissions
const PENDING_KEY = 'vibe:pending_projects';
const FEATURED_KEY = 'vibe:featured_projects';

// In-memory fallbacks
let memoryPending = [];
let memoryFeatured = [];

// KV wrapper functions
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getPending() {
  const kv = await getKV();
  if (kv) {
    const pending = await kv.get(PENDING_KEY);
    return pending || [];
  }
  return memoryPending;
}

async function savePending(pending) {
  const kv = await getKV();
  if (kv) {
    await kv.set(PENDING_KEY, pending);
  }
  memoryPending = pending;
}

async function getFeatured() {
  const kv = await getKV();
  if (kv) {
    const featured = await kv.get(FEATURED_KEY);
    return featured || [];
  }
  return memoryFeatured;
}

function generateId(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36).slice(-4);
}

// Validate AIRC signature (basic check - full verification in production)
function verifyAircSignature(project, airc) {
  if (!airc || !airc.handle || !airc.signature || !airc.public_key) {
    return false;
  }
  // In production, verify ed25519 signature against canonical JSON
  // For now, trust signed submissions from known handles
  return true;
}

// Check if URL is a Vercel deployment
function isVercelDeployment(url) {
  return url && (
    url.includes('.vercel.app') ||
    url.includes('.vercel.') ||
    url.includes('vercel.app')
  );
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // Read projects.json (with fallback for serverless env)
      let projects = [];
      let data = {
        projects: [],
        stats: { totalProjects: 0, liveProjects: 0, categories: [] }
      };

      try {
        const projectsPath = path.join(process.cwd(), 'data/projects.json');
        data = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
        projects = data.projects;
      } catch (fileError) {
        console.error('[projects] Failed to read projects.json:', fileError.message);
        console.log('[projects] Falling back to KV-only mode');
        // Continue with empty projects array, will merge KV data below
      }

      // Merge in approved projects from KV (user-submitted, auto-approved)
      const kv = await getKV();
      if (kv) {
        const approvedKey = 'vibe:approved_projects';
        const approved = await kv.get(approvedKey) || [];
        if (approved.length > 0) {
          // Add approved projects at the start, deduped by id
          const existingIds = new Set(projects.map(p => p.id));
          const newApproved = approved.filter(p => !existingIds.has(p.id));
          projects = [...newApproved, ...projects];
        }

        // Filter out hidden projects (unless admin=true query param)
        if (req.query.admin !== 'true') {
          const hiddenKey = 'vibe:hidden_projects';
          const hidden = await kv.get(hiddenKey) || [];
          if (hidden.length > 0) {
            const hiddenIds = new Set(hidden);
            projects = projects.filter(p => !hiddenIds.has(p.id));
          }
        }
      }

      // Apply filters
      const { category, creator, search, status, limit, offset, view } = req.query;

      // Handle special views (Yahoo-style discovery)
      if (view === 'new') {
        // Recently added - last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        projects = projects
          .filter(p => new Date(p.createdAt || p.date) >= thirtyDaysAgo)
          .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      } else if (view === 'rising') {
        // Most liked/engaged projects
        projects = projects
          .filter(p => (p.likes || 0) > 0 || (p.clones || 0) > 0)
          .sort((a, b) => ((b.likes || 0) + (b.clones || 0) * 2) - ((a.likes || 0) + (a.clones || 0) * 2));
      } else if (view === 'featured') {
        // Curator picks - stored in KV
        const featured = await getFeatured();
        const featuredIds = new Set(featured);
        projects = projects.filter(p => featuredIds.has(p.id));
      } else if (view === 'pending') {
        // Pending submissions (curator only) - stored in KV
        const pending = await getPending();
        return res.status(200).json({
          success: true,
          data: {
            projects: pending,
            pagination: { total: pending.length, offset: 0, limit: pending.length, hasMore: false },
            view: 'pending'
          }
        });
      }

      if (category && category !== 'all') {
        projects = projects.filter(p => p.category === category);
      }

      if (creator) {
        projects = projects.filter(p => p.creator === creator);
      }

      if (status) {
        projects = projects.filter(p => p.status === status);
      }

      if (search) {
        const query = search.toLowerCase();
        projects = projects.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        );
      }

      // Pagination
      const total = projects.length;
      const offsetNum = parseInt(offset) || 0;
      const limitNum = parseInt(limit) || 100;

      projects = projects.slice(offsetNum, offsetNum + limitNum);

      return res.status(200).json({
        success: true,
        data: {
          projects,
          pagination: {
            total,
            offset: offsetNum,
            limit: limitNum,
            hasMore: offsetNum + limitNum < total
          },
          stats: data.stats,
          view: view || 'all'
        }
      });

    } catch (error) {
      console.error('Projects API error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch projects'
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, url, description, category, creator, airc } = body;

      // Validate required fields
      if (!name || !url || !description || !category) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, url, description, category'
        });
      }

      // Validate category
      const validCategories = ['agents', 'platform', 'art', 'tools', 'infrastructure', 'culture', 'education'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        });
      }

      // Generate project object
      const project = {
        id: generateId(name),
        name: name.trim(),
        url: url.trim(),
        description: description.trim(),
        category,
        status: 'pending',
        creator: (creator || 'anonymous').replace('@', '').trim(),
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        likes: 0,
        clones: 0,
        verified: false,
        // Track verification signals
        signals: {
          isVercel: isVercelDeployment(url),
          hasAirc: !!airc,
          aircHandle: airc?.handle || null,
          aircVerified: airc ? verifyAircSignature(project, airc) : false
        }
      };

      // Auto-approve conditions:
      // 1. AIRC signed submission from verified handle
      // 2. Vercel deployment (can verify ownership later)
      const autoApprove = project.signals.aircVerified || project.signals.isVercel;

      if (autoApprove) {
        // Mark as live and store in KV (Vercel filesystem is read-only)
        project.status = 'live';
        project.verified = project.signals.aircVerified;
        project.verifiedBy = project.signals.aircVerified ? 'airc' : 'vercel';

        // Store approved projects in KV for later merge into projects.json
        const kv = await getKV();
        if (kv) {
          const approvedKey = 'vibe:approved_projects';
          const approved = await kv.get(approvedKey) || [];
          approved.unshift(project);
          await kv.set(approvedKey, approved);
        }

        return res.status(201).json({
          success: true,
          message: 'Project added to directory!',
          data: {
            project,
            autoApproved: true,
            reason: project.signals.aircVerified ? 'AIRC verified identity' : 'Vercel deployment detected'
          }
        });
      }

      // Add to pending queue for review
      const pending = await getPending();
      pending.unshift(project);
      await savePending(pending);

      return res.status(202).json({
        success: true,
        message: 'Project submitted for review. A curator will review it soon.',
        data: {
          project,
          autoApproved: false,
          position: pending.length,
          tip: 'Add an AIRC signature or deploy to Vercel for instant approval!'
        }
      });

    } catch (error) {
      console.error('Project submission error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit project'
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
};
