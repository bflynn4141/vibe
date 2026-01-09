#!/bin/zsh
export VIBE_NONCE="test123"

__vibe_b64() {
    printf "%s" "$1" | base64 | tr -d '\n'
}

__vibe_preexec() {
    local cmd="$1"
    echo "DEBUG: preexec called with cmd='$cmd'"
    echo "DEBUG: base64 result='$(__vibe_b64 "$cmd")'"
    printf "\033]133;VIBE;CMD;%s;vibe=%s\007" "$(__vibe_b64 "$cmd")" "${VIBE_NONCE}"
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __vibe_preexec

# Trigger a command
: test command
