/**
 * Skills Extraction - Auto-Generated from Observed Behavior
 *
 * Skills are extracted from:
 * - Board posts (content, tags, categories)
 * - workingOn field in presence
 * - GitHub repositories (if connected)
 * - Gigs completed
 *
 * This creates a "proof of work" profile - skills are earned, not claimed.
 */

// Skill taxonomy with keywords that map to each skill
const SKILL_KEYWORDS = {
  // Languages
  'typescript': ['typescript', 'ts', '.ts', 'tsx'],
  'javascript': ['javascript', 'js', 'node', 'nodejs', 'npm'],
  'python': ['python', 'py', 'pip', 'django', 'flask', 'fastapi'],
  'rust': ['rust', 'cargo', 'rustc'],
  'go': ['golang', ' go ', 'go-'],
  'solidity': ['solidity', 'sol', 'hardhat', 'foundry', 'smart contract'],

  // Frameworks & Tools
  'react': ['react', 'nextjs', 'next.js', 'jsx', 'tsx'],
  'vue': ['vue', 'vuejs', 'nuxt'],
  'svelte': ['svelte', 'sveltekit'],
  'tailwind': ['tailwind', 'tailwindcss'],

  // AI/ML
  'ai-ml': ['ai', 'ml', 'machine learning', 'gpt', 'llm', 'claude', 'openai', 'anthropic', 'langchain'],
  'ai-agents': ['agent', 'autonomous', 'agentic', 'mcp', 'tool use'],
  'computer-vision': ['vision', 'image', 'opencv', 'yolo', 'diffusion', 'stable diffusion', 'imagen'],

  // Infrastructure
  'vercel': ['vercel', 'serverless', 'edge function'],
  'aws': ['aws', 'lambda', 's3', 'ec2', 'dynamodb'],
  'docker': ['docker', 'container', 'kubernetes', 'k8s'],
  'database': ['postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'kv', 'supabase'],

  // Domains
  'cli-tools': ['cli', 'terminal', 'command line', 'shell', 'bash'],
  'api-dev': ['api', 'rest', 'graphql', 'endpoint', 'webhook'],
  'web3': ['web3', 'blockchain', 'crypto', 'nft', 'defi', 'solana', 'ethereum', 'base'],
  'devtools': ['devtool', 'developer tool', 'dx', 'sdk', 'library'],
  'platform': ['platform', 'infrastructure', 'saas', 'b2b'],

  // Creative
  'generative-art': ['generative', 'art', 'creative coding', 'p5', 'processing', 'three.js'],
  'design': ['design', 'ui', 'ux', 'figma', 'css'],
};

// Category to skill mapping (from board categories)
const CATEGORY_SKILLS = {
  'shipped': null,        // Doesn't map to skill, but shows completion
  'idea': null,
  'request': null,
  'riff': 'creative',
  'claim': null,
  'observation': null,
};

/**
 * Extract skills from text content
 * @param {string} text - Text to analyze
 * @returns {object} Map of skill -> count
 */
function extractSkillsFromText(text) {
  if (!text) return {};

  const lowerText = text.toLowerCase();
  const skills = {};

  for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
    for (const keyword of keywords) {
      // Use word boundary matching for short keywords
      const regex = keyword.length <= 3
        ? new RegExp(`\\b${keyword}\\b`, 'gi')
        : new RegExp(keyword, 'gi');

      const matches = lowerText.match(regex);
      if (matches) {
        skills[skill] = (skills[skill] || 0) + matches.length;
      }
    }
  }

  return skills;
}

/**
 * Gather all skill signals for a user
 * @param {object} kv - Vercel KV instance
 * @param {string} handle - User handle
 * @returns {Promise<object>} Skills data
 */
export async function gatherSkillSignals(kv, handle) {
  if (!kv || !handle) return null;

  const normalizedHandle = handle.toLowerCase().trim();

  try {
    // Fetch user's posts
    const postIds = await kv.lrange(`board:user:${normalizedHandle}`, 0, -1) || [];

    // Fetch post details
    const posts = postIds.length > 0
      ? await Promise.all(postIds.map(id => kv.get(`board:entry:${id}`)))
      : [];

    // Aggregate skills from posts
    const skillCounts = {};
    const shipCount = {};  // Track ships per skill for "proof"
    const tags = new Set();
    let totalShips = 0;

    for (const post of posts.filter(p => p)) {
      totalShips++;

      // Extract from content
      const contentSkills = extractSkillsFromText(post.content);
      for (const [skill, count] of Object.entries(contentSkills)) {
        skillCounts[skill] = (skillCounts[skill] || 0) + count;
        shipCount[skill] = (shipCount[skill] || 0) + 1;
      }

      // Extract from tags
      if (post.tags) {
        for (const tag of post.tags) {
          tags.add(tag.toLowerCase());
          const tagSkills = extractSkillsFromText(tag);
          for (const [skill, count] of Object.entries(tagSkills)) {
            skillCounts[skill] = (skillCounts[skill] || 0) + count;
          }
        }
      }
    }

    // Fetch presence for workingOn
    const presence = await kv.get(`presence:${normalizedHandle}`);
    if (presence?.workingOn) {
      const workingOnSkills = extractSkillsFromText(presence.workingOn);
      for (const [skill, count] of Object.entries(workingOnSkills)) {
        skillCounts[skill] = (skillCounts[skill] || 0) + count * 2; // Weight current work higher
      }
    }

    // Fetch GitHub profile if connected
    const githubProfile = await kv.hget('vibe:github:profiles', normalizedHandle);
    if (githubProfile) {
      const profile = typeof githubProfile === 'string' ? JSON.parse(githubProfile) : githubProfile;

      // Add languages from GitHub
      if (profile.topLanguages) {
        for (const lang of profile.topLanguages) {
          const langLower = lang.toLowerCase();
          if (SKILL_KEYWORDS[langLower]) {
            skillCounts[langLower] = (skillCounts[langLower] || 0) + 5;
          }
        }
      }

      // Add bio analysis
      if (profile.bio) {
        const bioSkills = extractSkillsFromText(profile.bio);
        for (const [skill, count] of Object.entries(bioSkills)) {
          skillCounts[skill] = (skillCounts[skill] || 0) + count;
        }
      }
    }

    // Normalize and rank skills
    const maxCount = Math.max(...Object.values(skillCounts), 1);
    const skills = Object.entries(skillCounts)
      .map(([skill, count]) => ({
        skill,
        count,
        ships: shipCount[skill] || 0,
        level: Math.min(10, Math.round((count / maxCount) * 10)),
        confidence: shipCount[skill] ? 'verified' : 'inferred',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12); // Top 12 skills

    return {
      handle: normalizedHandle,
      skills,
      totalShips,
      tags: Array.from(tags).slice(0, 20),
      hasGitHub: !!githubProfile,
      workingOn: presence?.workingOn || null,
    };

  } catch (e) {
    console.error('[skills] Gathering error:', e.message);
    return null;
  }
}

/**
 * Generate a skills card for a user
 * @param {object} kv - Vercel KV instance
 * @param {string} handle - User handle
 * @returns {Promise<object>} Skills card data
 */
export async function generateSkillsCard(kv, handle) {
  if (!kv || !handle) return null;

  const normalizedHandle = handle.toLowerCase().trim();

  // Check cache (10 min TTL)
  const cacheKey = `vibe:skillscard:${normalizedHandle}`;
  const cached = await kv.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Import vibe score
  const { getVibeScore, getTierDisplay } = await import('./vibescore.js');

  // Gather all data
  const [skillSignals, vibeScore, presence, streak] = await Promise.all([
    gatherSkillSignals(kv, normalizedHandle),
    getVibeScore(kv, normalizedHandle),
    kv.get(`presence:${normalizedHandle}`),
    kv.get(`streak:${normalizedHandle}`),
  ]);

  if (!skillSignals) return null;

  // Determine primary DNA (from existing system or infer)
  const dna = presence?.dna || inferDNA(skillSignals.skills);

  // Build the card
  const tierDisplay = vibeScore ? getTierDisplay(vibeScore.tier) : { emoji: '🌱', label: 'Newcomer' };

  const card = {
    handle: normalizedHandle,

    // Identity
    displayName: presence?.displayName || normalizedHandle,
    avatar: presence?.avatar || null,
    isAgent: presence?.isAgent || false,

    // DNA & Score
    dna,
    vibeScore: vibeScore?.score || 0,
    tier: vibeScore?.tier || 'newcomer',
    tierDisplay,

    // Skills (the meat of the card)
    skills: skillSignals.skills.map(s => ({
      name: formatSkillName(s.skill),
      key: s.skill,
      level: s.level,
      ships: s.ships,
      confidence: s.confidence,
      bar: generateBar(s.level),
    })),

    // Activity
    totalShips: skillSignals.totalShips,
    streak: streak?.current || 0,
    longestStreak: streak?.longest || 0,
    tags: skillSignals.tags,

    // Context
    workingOn: skillSignals.workingOn,
    hasGitHub: skillSignals.hasGitHub,

    // Meta
    generatedAt: new Date().toISOString(),
    cardVersion: '1.0',
  };

  // Cache for 10 minutes
  await kv.set(cacheKey, card, { ex: 600 });

  return card;
}

/**
 * Infer DNA from skills
 */
function inferDNA(skills) {
  if (!skills || skills.length === 0) {
    return { top: 'explorer', confidence: 0 };
  }

  // Map skills to DNA categories
  const dnaMap = {
    'ai-ml': 'agents',
    'ai-agents': 'agents',
    'cli-tools': 'tools',
    'devtools': 'tools',
    'api-dev': 'platform',
    'platform': 'platform',
    'vercel': 'platform',
    'web3': 'infrastructure',
    'database': 'infrastructure',
    'generative-art': 'creative',
    'design': 'creative',
  };

  const dnaCounts = {};
  for (const skill of skills) {
    const dna = dnaMap[skill.skill] || 'explorer';
    dnaCounts[dna] = (dnaCounts[dna] || 0) + skill.count;
  }

  const topDNA = Object.entries(dnaCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    top: topDNA ? topDNA[0] : 'explorer',
    breakdown: dnaCounts,
    confidence: topDNA ? Math.min(100, Math.round((topDNA[1] / skills.reduce((s, sk) => s + sk.count, 0)) * 100)) : 0,
  };
}

/**
 * Format skill name for display
 */
function formatSkillName(skill) {
  const names = {
    'typescript': 'TypeScript',
    'javascript': 'JavaScript',
    'python': 'Python',
    'rust': 'Rust',
    'go': 'Go',
    'solidity': 'Solidity',
    'react': 'React',
    'vue': 'Vue.js',
    'svelte': 'Svelte',
    'tailwind': 'Tailwind CSS',
    'ai-ml': 'AI/ML',
    'ai-agents': 'AI Agents',
    'computer-vision': 'Computer Vision',
    'vercel': 'Vercel',
    'aws': 'AWS',
    'docker': 'Docker/K8s',
    'database': 'Databases',
    'cli-tools': 'CLI Tools',
    'api-dev': 'API Development',
    'web3': 'Web3/Blockchain',
    'devtools': 'Developer Tools',
    'platform': 'Platform Building',
    'generative-art': 'Generative Art',
    'design': 'Design/UI',
  };
  return names[skill] || skill.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Generate ASCII bar for skill level
 */
function generateBar(level) {
  const filled = '█'.repeat(level);
  const empty = '░'.repeat(10 - level);
  return filled + empty;
}

/**
 * Get conversation starters based on skills
 */
export function getConversationStarters(skillsCard) {
  if (!skillsCard?.skills?.length) return [];

  const starters = [];
  const topSkills = skillsCard.skills.slice(0, 3);

  for (const skill of topSkills) {
    const templates = {
      'ai-agents': `their work on AI agents`,
      'ai-ml': `their ML projects`,
      'cli-tools': `building CLI tools`,
      'platform': `platform architecture`,
      'web3': `blockchain development`,
      'api-dev': `API design patterns`,
      'react': `React best practices`,
      'typescript': `TypeScript patterns`,
    };

    const topic = templates[skill.key] || skill.name.toLowerCase();
    starters.push(topic);
  }

  return starters;
}
