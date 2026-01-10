/**
 * GET /api/version - Get current /vibe version info
 * Used by MCP server to check for updates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read version from mcp-server/version.json
    const versionPath = path.join(__dirname, '..', 'mcp-server', 'version.json');
    const versionData = await fs.readFile(versionPath, 'utf-8');
    const version = JSON.parse(versionData);

    // Add download/install instructions
    version.install = {
      npm: 'npm install -g @brightseth/vibe',
      git: 'cd ~/.vibe/vibe-repo && git pull origin main',
      curl: 'curl -fsSL https://slashvibe.dev/install | sh'
    };

    return res.status(200).json(version);
  } catch (error) {
    console.error('GET /api/version error:', error);
    return res.status(500).json({ error: 'Failed to read version' });
  }
}
