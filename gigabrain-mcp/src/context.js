/**
 * Context — Detects current work terrain
 *
 * Project name (from package.json, Cargo.toml, or dir)
 * Tech stack (detects react, nextjs, supabase, solidity, etc.)
 * Git branch and recent files
 * Converts stack to searchable tags
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Stack detection patterns
 */
const STACK_PATTERNS = {
  // Frontend
  nextjs: ['next', '@next/font', 'next-auth'],
  react: ['react', 'react-dom'],
  vue: ['vue', 'nuxt'],
  svelte: ['svelte', '@sveltejs/kit'],

  // Backend
  express: ['express'],
  fastify: ['fastify'],
  hono: ['hono'],

  // Databases
  supabase: ['@supabase/supabase-js', '@supabase/auth-helpers'],
  prisma: ['@prisma/client', 'prisma'],
  drizzle: ['drizzle-orm'],
  mongodb: ['mongodb', 'mongoose'],

  // Web3
  solidity: ['solidity', 'hardhat', 'foundry'],
  wagmi: ['wagmi', 'viem'],
  ethers: ['ethers'],
  web3: ['web3'],

  // AI
  openai: ['openai'],
  anthropic: ['@anthropic-ai/sdk'],
  langchain: ['langchain'],

  // Infrastructure
  vercel: ['vercel', '@vercel/kv', '@vercel/postgres'],
  aws: ['aws-sdk', '@aws-sdk'],
  docker: ['docker'],

  // Languages
  typescript: ['typescript'],
  rust: ['cargo'],
  python: ['python', 'pip'],
  go: ['go.mod']
};

/**
 * Get current working context
 */
function getCurrentContext(cwd = process.cwd()) {
  const context = {
    project: null,
    stack: [],
    branch: null,
    recentFiles: []
  };

  // 1. Detect project name
  context.project = detectProject(cwd);

  // 2. Detect tech stack
  context.stack = detectStack(cwd);

  // 3. Get git branch
  context.branch = getGitBranch(cwd);

  // 4. Get recent files (last 5 modified)
  context.recentFiles = getRecentFiles(cwd);

  return context;
}

/**
 * Detect project name from various sources
 */
function detectProject(cwd) {
  // Try package.json
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name;
    }
  } catch (e) {}

  // Try Cargo.toml
  try {
    const cargoPath = path.join(cwd, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const cargo = fs.readFileSync(cargoPath, 'utf8');
      const match = cargo.match(/name\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    }
  } catch (e) {}

  // Try pyproject.toml
  try {
    const pyPath = path.join(cwd, 'pyproject.toml');
    if (fs.existsSync(pyPath)) {
      const py = fs.readFileSync(pyPath, 'utf8');
      const match = py.match(/name\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    }
  } catch (e) {}

  // Fallback to directory name
  const dirName = path.basename(cwd);
  if (dirName !== path.basename(process.env.HOME || '')) {
    return dirName;
  }

  return null;
}

/**
 * Detect tech stack from dependencies
 */
function detectStack(cwd) {
  const detected = new Set();

  // Check package.json
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };

      for (const [stack, patterns] of Object.entries(STACK_PATTERNS)) {
        if (patterns.some(p => deps[p])) {
          detected.add(stack);
        }
      }

      // Check for typescript
      if (deps.typescript || fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
        detected.add('typescript');
      }
    }
  } catch (e) {}

  // Check for Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    detected.add('rust');
  }

  // Check for Python
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
      fs.existsSync(path.join(cwd, 'requirements.txt'))) {
    detected.add('python');
  }

  // Check for Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    detected.add('go');
  }

  // Check for Solidity
  if (fs.existsSync(path.join(cwd, 'hardhat.config.js')) ||
      fs.existsSync(path.join(cwd, 'foundry.toml'))) {
    detected.add('solidity');
  }

  // Check for Docker
  if (fs.existsSync(path.join(cwd, 'Dockerfile')) ||
      fs.existsSync(path.join(cwd, 'docker-compose.yml'))) {
    detected.add('docker');
  }

  return Array.from(detected);
}

/**
 * Get current git branch
 */
function getGitBranch(cwd) {
  try {
    // Try reading .git/HEAD directly (faster)
    const headPath = path.join(cwd, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      const match = head.match(/ref: refs\/heads\/(.+)/);
      if (match) return match[1];
    }

    // Fallback to git command
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return branch;
  } catch (e) {
    return null;
  }
}

/**
 * Get recently modified files
 */
function getRecentFiles(cwd, limit = 5) {
  try {
    // Use git to find recently modified tracked files
    const output = execSync(
      `git diff --name-only HEAD~5 2>/dev/null || git ls-files -m`,
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!output) return [];

    return output.split('\n')
      .filter(f => f && !f.includes('node_modules') && !f.includes('.git'))
      .slice(0, limit);
  } catch (e) {
    return [];
  }
}

/**
 * Convert context to searchable tags
 */
function contextToTags(context) {
  const tags = [];

  // Add stack tags
  if (context.stack) {
    tags.push(...context.stack);
  }

  // Add project as tag
  if (context.project) {
    tags.push(context.project.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  }

  // Add branch if not main/master
  if (context.branch && !['main', 'master'].includes(context.branch)) {
    // Extract feature name from branch like "feature/token-swap"
    const parts = context.branch.split('/');
    if (parts.length > 1) {
      tags.push(parts[parts.length - 1].toLowerCase());
    }
  }

  return [...new Set(tags)];
}

/**
 * Format context for display
 */
function formatContext(context) {
  let display = '';

  if (context.project) {
    display += `**Project:** ${context.project}\n`;
  }

  if (context.stack && context.stack.length > 0) {
    display += `**Stack:** ${context.stack.join(', ')}\n`;
  }

  if (context.branch) {
    display += `**Branch:** ${context.branch}\n`;
  }

  if (context.recentFiles && context.recentFiles.length > 0) {
    display += `**Recent files:** ${context.recentFiles.slice(0, 3).join(', ')}\n`;
  }

  return display;
}

module.exports = {
  getCurrentContext,
  detectProject,
  detectStack,
  getGitBranch,
  getRecentFiles,
  contextToTags,
  formatContext
};
