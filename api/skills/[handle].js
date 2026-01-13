/**
 * Auto-Generated Skills Profile API
 *
 * GET /api/skills/:handle - Get auto-generated profile for a user
 *
 * "The more you use Vibe, the more hirable you become because you expose
 * yourself without you having to update your profile" - Seth
 *
 * Extracts skills from:
 * - Board posts (especially "shipped" category)
 * - Tags used
 * - Activity patterns
 * - Streak data
 */

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[skills] KV load error:', e.message);
    return null;
  }
}

// Skill categories for organization
const SKILL_CATEGORIES = {
  languages: ['javascript', 'typescript', 'python', 'rust', 'go', 'ruby', 'swift', 'kotlin', 'java', 'c', 'cpp', 'sql'],
  frameworks: ['react', 'vue', 'angular', 'nextjs', 'svelte', 'tailwind', 'express', 'fastapi', 'django', 'rails', 'flutter'],
  platforms: ['web', 'mobile', 'ios', 'android', 'desktop', 'cli', 'api', 'backend', 'frontend', 'fullstack'],
  ai_ml: ['ai', 'ml', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'langchain', 'rag', 'agents', 'mcp'],
  domains: ['crypto', 'web3', 'defi', 'nft', 'saas', 'ecommerce', 'fintech', 'healthtech', 'gaming', 'social'],
  tools: ['git', 'docker', 'aws', 'vercel', 'supabase', 'postgres', 'redis', 'mongodb', 'firebase']
};

// Extract skills from text content
function extractSkillsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const skills = new Set();

  // Check against all known skills
  Object.values(SKILL_CATEGORIES).flat().forEach(skill => {
    if (lower.includes(skill)) {
      skills.add(skill);
    }
  });

  // Common patterns
  if (lower.includes('landing page') || lower.includes('website')) skills.add('web');
  if (lower.includes('api') || lower.includes('endpoint')) skills.add('api');
  if (lower.includes('bot') || lower.includes('automation')) skills.add('automation');
  if (lower.includes('data') || lower.includes('analytics')) skills.add('data');
  if (lower.includes('ui') || lower.includes('ux') || lower.includes('design')) skills.add('design');

  return Array.from(skills);
}

// Categorize skills
function categorizeSkills(skills) {
  const categorized = {};

  for (const [category, categorySkills] of Object.entries(SKILL_CATEGORIES)) {
    const matches = skills.filter(s => categorySkills.includes(s));
    if (matches.length > 0) {
      categorized[category] = matches;
    }
  }

  // Uncategorized skills
  const allKnown = new Set(Object.values(SKILL_CATEGORIES).flat());
  const uncategorized = skills.filter(s => !allKnown.has(s));
  if (uncategorized.length > 0) {
    categorized['other'] = uncategorized;
  }

  return categorized;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      success: false,
      error: 'Skills unavailable'
    });
  }

  // Extract handle from path
  const handle = req.query.handle?.toLowerCase().trim();
  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required'
    });
  }

  try {
    // Get user's handle record
    const handleRecord = await kv.hget('vibe:handles', handle);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Get user's board posts
    const postIds = await kv.lrange(`board:user:${handle}`, 0, 99) || [];
    const posts = [];
    const allTags = [];
    const allSkills = new Set();
    let shippedCount = 0;

    for (const postId of postIds) {
      const postData = await kv.get(`board:entry:${postId}`);
      if (postData) {
        const post = typeof postData === 'string' ? JSON.parse(postData) : postData;
        posts.push({
          id: post.id,
          category: post.category,
          content: post.content?.substring(0, 200),
          tags: post.tags || [],
          timestamp: post.timestamp
        });

        // Count shipped posts
        if (post.category === 'shipped') {
          shippedCount++;
        }

        // Collect tags
        if (post.tags) {
          allTags.push(...post.tags);
        }

        // Extract skills from content
        const contentSkills = extractSkillsFromText(post.content);
        contentSkills.forEach(s => allSkills.add(s));

        // Add tags as skills
        if (post.tags) {
          post.tags.forEach(t => allSkills.add(t.toLowerCase()));
        }
      }
    }

    // Get streak data
    const streakData = await kv.get(`streak:${handle}`) || { current: 0, longest: 0, badges: [] };

    // Get gig history
    const gigIds = await kv.smembers(`vibe:gigs:by:${handle}`) || [];
    let gigsPosted = 0;
    let gigsCompleted = 0;

    for (const gigId of gigIds) {
      const gigData = await kv.hget('vibe:gigs', gigId);
      if (gigData) {
        const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
        gigsPosted++;
        if (gig.status === 'completed') {
          gigsCompleted++;
        }
      }
    }

    // Calculate skill frequency from tags
    const tagFrequency = {};
    allTags.forEach(tag => {
      const normalized = tag.toLowerCase();
      tagFrequency[normalized] = (tagFrequency[normalized] || 0) + 1;
    });

    // Sort skills by frequency
    const skillsArray = Array.from(allSkills);
    skillsArray.sort((a, b) => (tagFrequency[b] || 0) - (tagFrequency[a] || 0));

    // Calculate experience level
    let experienceLevel = 'beginner';
    if (shippedCount >= 10 || streakData.longest >= 30) {
      experienceLevel = 'expert';
    } else if (shippedCount >= 5 || streakData.longest >= 14) {
      experienceLevel = 'intermediate';
    } else if (shippedCount >= 2 || streakData.longest >= 7) {
      experienceLevel = 'builder';
    }

    // Build auto-profile
    const profile = {
      handle,
      registered_at: userData.registeredAt,
      genesis: userData.genesis || false,
      genesis_number: userData.genesis_number || null,
      x_handle: userData.x_handle || null,
      github_handle: userData.github_handle || null,

      // Activity metrics
      activity: {
        ships: shippedCount,
        total_posts: posts.length,
        current_streak: streakData.current || 0,
        longest_streak: streakData.longest || 0,
        badges: streakData.badges || [],
        last_active: userData.last_active_at || null
      },

      // Skills (auto-extracted)
      skills: skillsArray.slice(0, 20),
      skills_categorized: categorizeSkills(skillsArray),
      top_tags: Object.entries(tagFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count })),

      // Experience
      experience_level: experienceLevel,

      // Gig history
      gigs: {
        posted: gigsPosted,
        completed: gigsCompleted
      },

      // Recent work
      recent_ships: posts
        .filter(p => p.category === 'shipped')
        .slice(0, 5)
        .map(p => ({
          id: p.id,
          content: p.content,
          tags: p.tags,
          timestamp: p.timestamp
        })),

      // Hire info
      available_for_hire: true, // Default, could be configurable
      profile_url: `https://slashvibe.dev/u/${handle}`,

      generated_at: new Date().toISOString(),
      note: 'This profile is auto-generated from activity. The more you ship, the better your profile.'
    };

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.status(200).json({
      success: true,
      profile
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
