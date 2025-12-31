#!/usr/bin/env node
/**
 * Gigabrain MCP Server — The Collective Memory for Claude Code
 *
 * Vibe makes serious creation multiplayer.
 *
 * 3 tools:
 * - gigabrain_explore — Search terrain, find related traces
 * - gigabrain_trace   — Leave a thinking artifact
 * - gigabrain_who     — See who's building what
 */

const fs = require('fs');
const path = require('path');
const { toolDefinitions, handleToolCall } = require('./src/tools');

const CONFIG_DIR = path.join(process.env.HOME, '.vibe');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Load configuration
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { username: 'anonymous', building: null };
}

/**
 * MCP Protocol Handler
 */
class GigabrainMCPServer {
  constructor() {
    this.config = loadConfig();
  }

  async handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'gigabrain',
              version: '1.0.0',
              description: 'Collective memory for Claude Code builders'
            }
          }
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: toolDefinitions }
        };

      case 'tools/call':
        const result = await handleToolCall(
          params.name,
          params.arguments || {},
          this.config
        );

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: result.display || JSON.stringify(result, null, 2)
            }]
          }
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  start() {
    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const request = JSON.parse(line);
          const response = await this.handleRequest(request);
          if (response) {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch (e) {
          process.stderr.write(`Error: ${e.message}\n`);
        }
      }
    });

    // Show welcome
    const username = this.config.username;
    if (username && username !== 'anonymous') {
      process.stderr.write(`\nGigabrain ready, @${username}.\n`);
      process.stderr.write(`Explore what others built: gigabrain_explore\n`);
      process.stderr.write(`Leave a trace: gigabrain_trace\n\n`);
    } else {
      process.stderr.write(`\nGigabrain ready.\n`);
      process.stderr.write(`Run the installer to set your username.\n\n`);
    }
  }
}

// Start
const server = new GigabrainMCPServer();
server.start();
