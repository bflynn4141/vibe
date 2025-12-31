#!/bin/bash
# Gigabrain MCP Installer
# The collective memory for Claude Code builders

set -e

VIBE_DIR="$HOME/.vibe"
CONFIG_FILE="$VIBE_DIR/config.json"
CLAUDE_CONFIG="$HOME/.claude.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   GIGABRAIN                                               ║"
echo "║   The collective memory for Claude Code builders          ║"
echo "║                                                           ║"
echo "║   Vibe makes serious creation multiplayer.                ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Create .vibe directory
mkdir -p "$VIBE_DIR"

# Check for existing config
if [ -f "$CONFIG_FILE" ]; then
  EXISTING_USER=$(cat "$CONFIG_FILE" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "anonymous" ]; then
    echo "Welcome back, @$EXISTING_USER"
    echo ""
    read -p "Keep this username? [Y/n] " KEEP_USER
    if [ "$KEEP_USER" = "n" ] || [ "$KEEP_USER" = "N" ]; then
      EXISTING_USER=""
    fi
  fi
fi

# Get username
if [ -z "$EXISTING_USER" ]; then
  echo "What's your handle? (lowercase, no @)"
  read -p "@" USERNAME
  USERNAME=$(echo "$USERNAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')
  if [ -z "$USERNAME" ]; then
    USERNAME="anonymous"
  fi
else
  USERNAME="$EXISTING_USER"
fi

# Get what they're building
echo ""
echo "What are you building? (one line)"
read -p "> " BUILDING

# Write config
cat > "$CONFIG_FILE" << EOF
{
  "username": "$USERNAME",
  "building": "$BUILDING",
  "installed": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo ""
echo "Config saved to $CONFIG_FILE"

# Install MCP server to Claude Code
echo ""
echo "Adding Gigabrain to Claude Code..."

# Check if Claude config exists
if [ ! -f "$CLAUDE_CONFIG" ]; then
  # Create minimal Claude config
  cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "gigabrain": {
      "command": "node",
      "args": ["$SCRIPT_DIR/index.js"]
    }
  }
}
EOF
  echo "Created $CLAUDE_CONFIG with Gigabrain MCP server"
else
  # Check if jq is available for JSON manipulation
  if command -v jq &> /dev/null; then
    # Use jq to add/update the gigabrain server
    TEMP_FILE=$(mktemp)
    jq --arg script "$SCRIPT_DIR/index.js" '.mcpServers.gigabrain = {"command": "node", "args": [$script]}' "$CLAUDE_CONFIG" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$CLAUDE_CONFIG"
    echo "Updated $CLAUDE_CONFIG with Gigabrain MCP server"
  else
    echo ""
    echo "To complete setup, add this to your ~/.claude.json mcpServers:"
    echo ""
    echo '  "gigabrain": {'
    echo '    "command": "node",'
    echo "    \"args\": [\"$SCRIPT_DIR/index.js\"]"
    echo '  }'
    echo ""
  fi
fi

# Create empty traces file if it doesn't exist
TRACES_FILE="$VIBE_DIR/gigabrain.jsonl"
if [ ! -f "$TRACES_FILE" ]; then
  touch "$TRACES_FILE"
  echo "Created $TRACES_FILE"
fi

# Done
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   Ready, @$USERNAME"
echo "║                                                           ║"
echo "║   In Claude Code:                                         ║"
echo "║   • gigabrain_explore — Search the collective memory      ║"
echo "║   • gigabrain_trace   — Leave a thinking artifact         ║"
echo "║   • gigabrain_who     — See who's building                ║"
echo "║                                                           ║"
echo "║   Your traces live at ~/.vibe/gigabrain.jsonl             ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
