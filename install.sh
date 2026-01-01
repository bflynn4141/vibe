#!/bin/bash
# /vibe installer for Claude Code
# Phase 1: identity, presence, DM

set -e

VIBE_DIR="$HOME/.vibe"
MCP_DIR="$VIBE_DIR/mcp-server"
REPO_URL="https://raw.githubusercontent.com/brightseth/vibe/main"

echo ""
echo "/vibe installer"
echo "==============="
echo ""

# Create directories
mkdir -p "$MCP_DIR/tools" "$MCP_DIR/store"

# Download MCP server files
echo "Downloading MCP server..."

curl -fsSL "$REPO_URL/mcp-server/index.js" -o "$MCP_DIR/index.js"
curl -fsSL "$REPO_URL/mcp-server/config.js" -o "$MCP_DIR/config.js"
curl -fsSL "$REPO_URL/mcp-server/presence.js" -o "$MCP_DIR/presence.js"

curl -fsSL "$REPO_URL/mcp-server/store/index.js" -o "$MCP_DIR/store/index.js"
curl -fsSL "$REPO_URL/mcp-server/store/local.js" -o "$MCP_DIR/store/local.js"
curl -fsSL "$REPO_URL/mcp-server/store/api.js" -o "$MCP_DIR/store/api.js"

curl -fsSL "$REPO_URL/mcp-server/tools/init.js" -o "$MCP_DIR/tools/init.js"
curl -fsSL "$REPO_URL/mcp-server/tools/who.js" -o "$MCP_DIR/tools/who.js"
curl -fsSL "$REPO_URL/mcp-server/tools/ping.js" -o "$MCP_DIR/tools/ping.js"
curl -fsSL "$REPO_URL/mcp-server/tools/dm.js" -o "$MCP_DIR/tools/dm.js"
curl -fsSL "$REPO_URL/mcp-server/tools/inbox.js" -o "$MCP_DIR/tools/inbox.js"
curl -fsSL "$REPO_URL/mcp-server/tools/open.js" -o "$MCP_DIR/tools/open.js"

echo "Downloaded to $MCP_DIR"

# Update Claude Code config
CLAUDE_CONFIG="$HOME/.claude.json"

echo ""
echo "Configuring Claude Code..."

if [ ! -f "$CLAUDE_CONFIG" ]; then
  cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "vibe": {
      "command": "node",
      "args": ["$MCP_DIR/index.js"],
      "env": {
        "VIBE_API_URL": "https://vibe-public-topaz.vercel.app"
      }
    }
  }
}
EOF
  echo "Created $CLAUDE_CONFIG"
else
  # Check if jq is available
  if command -v jq &> /dev/null; then
    TEMP_FILE=$(mktemp)
    jq --arg dir "$MCP_DIR" '.mcpServers.vibe = {
      "command": "node",
      "args": [$dir + "/index.js"],
      "env": {
        "VIBE_API_URL": "https://vibe-public-topaz.vercel.app"
      }
    }' "$CLAUDE_CONFIG" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$CLAUDE_CONFIG"
    echo "Updated $CLAUDE_CONFIG"
  else
    echo ""
    echo "Add this to your ~/.claude.json mcpServers:"
    echo ""
    echo '  "vibe": {'
    echo '    "command": "node",'
    echo "    \"args\": [\"$MCP_DIR/index.js\"],"
    echo '    "env": {'
    echo '      "VIBE_API_URL": "https://vibe-public-topaz.vercel.app"'
    echo '    }'
    echo '  }'
    echo ""
  fi
fi

# Done
echo ""
echo "==============="
echo "/vibe installed"
echo ""
echo "Restart Claude Code, then run:"
echo ""
echo "  vibe init     - set your identity"
echo "  vibe who      - see who's around"
echo "  vibe dm       - message someone"
echo ""
