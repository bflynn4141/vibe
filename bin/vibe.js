#!/usr/bin/env node

/**
 * /vibe CLI
 * Entry point for npm-installed vibe
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpServerPath = path.join(__dirname, '..', 'mcp-server', 'index.js');

// Forward to MCP server
const child = spawn('node', [mcpServerPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VIBE_NPM_INSTALL: 'true'
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
