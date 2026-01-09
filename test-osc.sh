#!/bin/zsh
# Test OSC sequence emission

export VIBE_NONCE="test123"
export VIBE_SESSION_ID="test-session"

# Source the integration
source shell-integration/vibe.zsh

# Run a simple command
echo "hello world"
