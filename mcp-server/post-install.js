#!/usr/bin/env node

/**
 * Post-install script for @brightseth/vibe
 * Sets up MCP server configuration for Claude Code
 */

import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

const HOME = homedir();
const CLAUDE_CONFIG_DIR = path.join(HOME, '.config', 'claude-code');
const MCP_CONFIG_PATH = path.join(CLAUDE_CONFIG_DIR, 'mcp.json');

async function setup() {
  console.log('\n📦 Setting up /vibe...\n');

  try {
    // Ensure config directory exists
    await fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true });

    // Read existing MCP config or create new
    let config = { mcpServers: {} };
    try {
      const existing = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      config = JSON.parse(existing);
      if (!config.mcpServers) config.mcpServers = {};
    } catch (error) {
      // File doesn't exist, use default
    }

    // Find where @brightseth/vibe is installed
    const npmPrefix = process.env.npm_config_prefix || '/usr/local';
    const mcpServerPath = path.join(npmPrefix, 'lib', 'node_modules', '@brightseth', 'vibe', 'mcp-server', 'index.js');

    // Add or update vibe configuration
    config.mcpServers.vibe = {
      command: 'node',
      args: [mcpServerPath],
      env: {
        VIBE_NPM_INSTALL: 'true'
      }
    };

    // Write config
    await fs.writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));

    console.log('✅ /vibe MCP server configured\n');
    console.log('Next steps:');
    console.log('  1. Restart Claude Code');
    console.log('  2. Run: vibe init @yourusername\n');
    console.log('📖 Docs: https://slashvibe.dev\n');

  } catch (error) {
    console.error('⚠️  Setup incomplete:', error.message);
    console.error('\nManual setup:');
    console.error('  Add to ~/.config/claude-code/mcp.json:\n');
    console.error('  {');
    console.error('    "mcpServers": {');
    console.error('      "vibe": {');
    console.error('        "command": "node",');
    console.error('        "args": ["/path/to/node_modules/@brightseth/vibe/mcp-server/index.js"]');
    console.error('      }');
    console.error('    }');
    console.error('  }\n');
  }
}

setup();
