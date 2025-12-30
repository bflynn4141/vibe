#!/bin/bash
# /vibe Auto-Capture Hook
# Fires on SessionEnd, extracts session intelligence, posts to collective memory
# Install: Copy to ~/.claude/hooks/ and chmod +x

set -e

# Read hook input from stdin
INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
REASON=$(echo "$INPUT" | jq -r '.reason // empty')

# Skip if no transcript or cleared session
[ -z "$TRANSCRIPT" ] && exit 0
[ "$REASON" = "clear" ] && exit 0
[ ! -f "$TRANSCRIPT" ] && exit 0

# Get username (same priority as MCP server)
get_username() {
  # 1. Config file
  if [ -f "$HOME/.vibecodings/config.json" ]; then
    jq -r '.username // empty' "$HOME/.vibecodings/config.json" 2>/dev/null && return
  fi
  # 2. Environment
  [ -n "$VIBE_USERNAME" ] && echo "$VIBE_USERNAME" && return
  # 3. Git config
  git config --global user.name 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d ' ' && return
  # 4. System user
  echo "$USER"
}

USERNAME=$(get_username)
PROJECT=$(basename "$CWD")

# Extract intelligence from transcript
# Count messages
MESSAGE_COUNT=$(wc -l < "$TRANSCRIPT" | tr -d ' ')

# Skip tiny sessions (< 5 messages = probably just opened and closed)
[ "$MESSAGE_COUNT" -lt 5 ] && exit 0

# Extract tools used (unique list)
TOOLS=$(grep -o '"tool_name":"[^"]*"' "$TRANSCRIPT" 2>/dev/null | cut -d'"' -f4 | sort -u | head -10 | tr '\n' ',' | sed 's/,$//')

# Extract files touched (from Read, Write, Edit tools)
FILES=$(grep -oE '"file_path":"[^"]*"' "$TRANSCRIPT" 2>/dev/null | cut -d'"' -f4 | xargs -I{} basename {} 2>/dev/null | sort -u | head -10 | tr '\n' ',' | sed 's/,$//')

# Detect tech from files
TECH=""
echo "$FILES" | grep -q "\.tsx\|\.jsx" && TECH="$TECH,React"
echo "$FILES" | grep -q "\.py" && TECH="$TECH,Python"
echo "$FILES" | grep -q "\.rs" && TECH="$TECH,Rust"
echo "$FILES" | grep -q "\.go" && TECH="$TECH,Go"
echo "$FILES" | grep -q "\.sol" && TECH="$TECH,Solidity"
[ -f "$CWD/package.json" ] && grep -q "next" "$CWD/package.json" 2>/dev/null && TECH="$TECH,Next.js"
[ -f "$CWD/package.json" ] && grep -q "redis\|@vercel/kv" "$CWD/package.json" 2>/dev/null && TECH="$TECH,Redis"
TECH=$(echo "$TECH" | sed 's/^,//')

# Build auto-summary from signals
if [ -n "$FILES" ]; then
  SUMMARY="Worked on $PROJECT: $FILES"
else
  SUMMARY="Session in $PROJECT ($MESSAGE_COUNT messages)"
fi

# Post to /vibe (fire and forget)
curl -s -X POST "https://slashvibe.dev/api/gigabrain/ingest" \
  -H "Content-Type: application/json" \
  -d "{
    \"user\": \"$USERNAME\",
    \"project\": \"$PROJECT\",
    \"summary\": \"$SUMMARY\",
    \"tech\": [$(echo "$TECH" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],
    \"tools\": [$(echo "$TOOLS" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],
    \"files\": [$(echo "$FILES" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],
    \"messages\": $MESSAGE_COUNT,
    \"sessionId\": \"$SESSION_ID\",
    \"auto\": true
  }" > /dev/null 2>&1 &

exit 0
