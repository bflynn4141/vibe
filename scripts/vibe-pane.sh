#!/bin/bash
# /vibe pane — Ambient presence sidebar for your terminal
# Shows who's online in a tmux split pane

set -e

VIBE_API="${VIBE_API_URL:-https://www.slashvibe.dev}"
PANE_WIDTH=20

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
CYAN='\033[36m'
RESET='\033[0m'

# Check dependencies
check_deps() {
    if ! command -v curl &> /dev/null; then
        echo "Error: curl is required"
        exit 1
    fi
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required (brew install jq)"
        exit 1
    fi
}

# Fetch who's online
fetch_presence() {
    curl -sL "$VIBE_API/api/presence/who" 2>/dev/null || echo '{"users":[]}'
}

# Get status emoji based on user state
get_status_emoji() {
    local status="$1"
    local mood="$2"

    # Mood takes priority
    case "$mood" in
        "shipping"|"🚀"|"🔥") echo "🔥" ;;
        "debugging"|"🐛") echo "🐛" ;;
        "thinking"|"🧠") echo "🧠" ;;
        "afk"|"🌙") echo "🌙" ;;
        "celebrating"|"🎉") echo "🎉" ;;
        "pairing"|"👥") echo "👥" ;;
        *)
            # Fall back to status
            if [ "$status" = "active" ]; then
                echo "⚡"
            else
                echo "○"
            fi
            ;;
    esac
}

# Truncate string to fit width
truncate() {
    local str="$1"
    local max="$2"
    if [ ${#str} -gt $max ]; then
        echo "${str:0:$((max-2))}.."
    else
        echo "$str"
    fi
}

# Render the pane content
render() {
    local data="$1"
    local width=$((PANE_WIDTH - 2))

    # Clear screen and move to top
    clear

    # Header
    echo -e "${BOLD}${CYAN} ☕ vibe${RESET}"
    echo -e "${DIM} ──────────────${RESET}"
    echo ""

    # Parse users
    local user_count=$(echo "$data" | jq -r '.users | length')

    if [ "$user_count" -eq 0 ] || [ "$user_count" = "null" ]; then
        echo -e "${DIM} No one here${RESET}"
        echo -e "${DIM} yet...${RESET}"
    else
        # Show each user
        echo "$data" | jq -r '.users[] | "\(.handle)|\(.status)|\(.mood // "")|\(.one_liner // "")|\(.note // "")"' | while IFS='|' read -r handle status mood one_liner note; do
            local emoji=$(get_status_emoji "$status" "$mood")
            local display_handle=$(truncate "$handle" 10)

            # User line (compact)
            echo -e " ${emoji} ${BOLD}${display_handle}${RESET}"
        done
    fi

    # Footer
    echo ""
    echo -e "${DIM} ──────────────${RESET}"
    echo -e "${DIM} r=refresh q=quit${RESET}"
}

# Main pane loop
run_pane() {
    # Save terminal settings and enable raw input
    local old_stty=$(stty -g)
    trap "stty '$old_stty'" EXIT

    # Initial fetch
    local data=$(fetch_presence)
    render "$data"

    # Read input with timeout for periodic refresh hints
    while true; do
        # Read single character with 30s timeout
        if read -rsn1 -t 30 key 2>/dev/null; then
            case "$key" in
                r|R)
                    echo -e "\n${DIM}  ...${RESET}"
                    data=$(fetch_presence)
                    render "$data"
                    ;;
                q|Q)
                    clear
                    echo -e "${DIM}  👋${RESET}"
                    exit 0
                    ;;
            esac
        else
            # Timeout - auto refresh
            data=$(fetch_presence)
            render "$data"
        fi
    done
}

# Split tmux and run pane in new split
spawn_pane() {
    if [ -z "$TMUX" ]; then
        echo "Not in tmux."
        echo ""
        echo "Run this from inside tmux, or start tmux first:"
        echo "  tmux new-session"
        echo ""
        echo "Then run:"
        echo "  ~/.vibe/vibe-pane.sh"
        exit 1
    else
        # Already in tmux, just split
        tmux split-window -h -l $PANE_WIDTH "$0 --run-pane"
        tmux select-pane -L  # Go back to original pane
    fi
}

# Entry point
main() {
    check_deps

    case "${1:-}" in
        --run-pane)
            # Called from within the split pane
            run_pane
            ;;
        --help|-h)
            echo "Usage: vibe-pane.sh [OPTIONS]"
            echo ""
            echo "Opens a tmux split pane showing who's online on /vibe"
            echo ""
            echo "Options:"
            echo "  --run-pane    Run the pane directly (used internally)"
            echo "  --help        Show this help"
            echo ""
            echo "Keyboard shortcuts (in pane):"
            echo "  r    Refresh presence"
            echo "  q    Close pane"
            ;;
        *)
            spawn_pane
            ;;
    esac
}

main "$@"
