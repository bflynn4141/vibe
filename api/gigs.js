/**
 * Vibe Gigs API - Skills marketplace for vibe coders
 *
 * GET /api/gigs - Browse all open gigs
 * POST /api/gigs - Post a new gig
 * GET /api/gigs?id=X - Get specific gig details
 * POST /api/gigs/apply - Apply to a gig
 * POST /api/gigs/hire - Hire someone for a gig
 *
 * "Task Rabbit meets skills marketplace" - Rob Goldman
 */

import { logEvent } from './lib/events.js';

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[gigs] KV load error:', e.message);
    return null;
  }
}

// Generate unique gig ID
function generateGigId() {
  return 'gig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// Valid gig categories
const GIG_CATEGORIES = [
  'build',      // Build something from scratch
  'fix',        // Fix or debug existing code
  'design',     // UI/UX design work
  'review',     // Code review or audit
  'teach',      // Tutoring or pair programming
  'consult',    // Strategic advice
  'other'
];

// Valid gig statuses
const GIG_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];

// Default hourly rates by category (for suggestions)
const SUGGESTED_RATES = {
  build: { min: 200, max: 500 },
  fix: { min: 100, max: 300 },
  design: { min: 150, max: 400 },
  review: { min: 100, max: 250 },
  teach: { min: 100, max: 200 },
  consult: { min: 300, max: 1000 },
  other: { min: 100, max: 500 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      success: false,
      error: 'Gigs temporarily unavailable'
    });
  }

  const path = req.url.split('?')[0];

  // POST /api/gigs - Create a new gig
  if (req.method === 'POST' && (path === '/api/gigs' || path === '/api/gigs/')) {
    const {
      poster,
      title,
      description,
      category = 'build',
      skills_needed = [],
      budget,
      deadline,
      deliverables
    } = req.body || {};

    // Validate required fields
    if (!poster || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: poster, title, description'
      });
    }

    // Validate category
    if (!GIG_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${GIG_CATEGORIES.join(', ')}`
      });
    }

    const id = generateGigId();
    const now = new Date().toISOString();

    const gig = {
      id,
      poster: poster.toLowerCase().trim(),
      title: title.substring(0, 200),
      description: description.substring(0, 2000),
      category,
      skills_needed: skills_needed.slice(0, 10).map(s => s.toLowerCase().trim()),
      budget: budget || SUGGESTED_RATES[category],
      deadline: deadline || null,
      deliverables: deliverables ? deliverables.substring(0, 1000) : null,
      status: 'open',
      applicants: [],
      hired: null,
      created_at: now,
      updated_at: now
    };

    // Store gig
    await kv.hset('vibe:gigs', { [id]: JSON.stringify(gig) });

    // Add to open gigs list (newest first)
    await kv.lpush('vibe:gigs:open', id);

    // Add to poster's gigs
    await kv.sadd(`vibe:gigs:by:${gig.poster}`, id);

    // Log analytics event
    await logEvent(kv, 'gig_created', gig.poster, { id, category, skills: skills_needed });

    return res.status(200).json({
      success: true,
      gig,
      message: `Gig posted! Share it: slashvibe.dev/gigs/${id}`
    });
  }

  // POST /api/gigs/apply - Apply to a gig
  if (req.method === 'POST' && path === '/api/gigs/apply') {
    const { gig_id, applicant, message, rate } = req.body || {};

    if (!gig_id || !applicant) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: gig_id, applicant'
      });
    }

    // Get gig
    const gigData = await kv.hget('vibe:gigs', gig_id);
    if (!gigData) {
      return res.status(404).json({
        success: false,
        error: 'Gig not found'
      });
    }

    const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;

    if (gig.status !== 'open') {
      return res.status(400).json({
        success: false,
        error: 'This gig is no longer accepting applications'
      });
    }

    // Check if already applied
    const alreadyApplied = gig.applicants.some(a => a.handle === applicant.toLowerCase());
    if (alreadyApplied) {
      return res.status(400).json({
        success: false,
        error: 'You have already applied to this gig'
      });
    }

    // Add application
    const application = {
      handle: applicant.toLowerCase().trim(),
      message: message ? message.substring(0, 500) : null,
      rate: rate || null,
      applied_at: new Date().toISOString()
    };

    gig.applicants.push(application);
    gig.updated_at = new Date().toISOString();

    // Update gig
    await kv.hset('vibe:gigs', { [gig_id]: JSON.stringify(gig) });

    // Log analytics event
    await logEvent(kv, 'gig_applied', applicant.toLowerCase(), { gig_id });

    return res.status(200).json({
      success: true,
      application,
      message: `Applied to "${gig.title}"! The poster will review your application.`
    });
  }

  // POST /api/gigs/hire - Hire someone for a gig
  if (req.method === 'POST' && path === '/api/gigs/hire') {
    const { gig_id, poster, hire } = req.body || {};

    if (!gig_id || !poster || !hire) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: gig_id, poster, hire'
      });
    }

    // Get gig
    const gigData = await kv.hget('vibe:gigs', gig_id);
    if (!gigData) {
      return res.status(404).json({
        success: false,
        error: 'Gig not found'
      });
    }

    const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;

    // Verify poster owns the gig
    if (gig.poster !== poster.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Only the gig poster can hire'
      });
    }

    if (gig.status !== 'open') {
      return res.status(400).json({
        success: false,
        error: 'This gig is not open for hiring'
      });
    }

    // Check hire is in applicants
    const applicant = gig.applicants.find(a => a.handle === hire.toLowerCase());
    if (!applicant) {
      return res.status(400).json({
        success: false,
        error: 'This person has not applied to the gig'
      });
    }

    // Update gig
    gig.hired = hire.toLowerCase();
    gig.status = 'in_progress';
    gig.updated_at = new Date().toISOString();
    gig.hired_at = new Date().toISOString();

    await kv.hset('vibe:gigs', { [gig_id]: JSON.stringify(gig) });

    // Remove from open list
    await kv.lrem('vibe:gigs:open', 0, gig_id);

    // Log analytics events
    await logEvent(kv, 'gig_hired', poster.toLowerCase(), { gig_id, hired: gig.hired });

    return res.status(200).json({
      success: true,
      gig,
      message: `Hired @${gig.hired} for "${gig.title}"!`
    });
  }

  // GET /api/gigs - Browse gigs or get specific gig
  if (req.method === 'GET') {
    const { id, poster, status = 'open', limit = 20 } = req.query;

    // Get specific gig by ID
    if (id) {
      const gigData = await kv.hget('vibe:gigs', id);
      if (!gigData) {
        return res.status(404).json({
          success: false,
          error: 'Gig not found'
        });
      }

      const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
      return res.status(200).json({
        success: true,
        gig
      });
    }

    // Get gigs by poster
    if (poster) {
      const gigIds = await kv.smembers(`vibe:gigs:by:${poster.toLowerCase()}`) || [];
      const gigs = [];

      for (const gigId of gigIds) {
        const gigData = await kv.hget('vibe:gigs', gigId);
        if (gigData) {
          const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
          gigs.push(gig);
        }
      }

      return res.status(200).json({
        success: true,
        gigs: gigs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        count: gigs.length
      });
    }

    // Browse open gigs
    const cappedLimit = Math.min(Math.max(1, parseInt(limit)), 50);
    const gigIds = await kv.lrange('vibe:gigs:open', 0, cappedLimit - 1) || [];
    const gigs = [];

    for (const gigId of gigIds) {
      const gigData = await kv.hget('vibe:gigs', gigId);
      if (gigData) {
        const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
        // Don't expose full applicant details in browse view
        gigs.push({
          ...gig,
          applicants: gig.applicants.length, // Just count
          applicant_handles: gig.applicants.map(a => a.handle) // Just handles
        });
      }
    }

    // Cache for 30 seconds
    res.setHeader('Cache-Control', 'public, max-age=30');

    return res.status(200).json({
      success: true,
      gigs,
      count: gigs.length,
      categories: GIG_CATEGORIES,
      suggested_rates: SUGGESTED_RATES
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
