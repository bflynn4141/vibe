# Quick Start - Get Running in 5 Minutes

## Step 1: Install Prerequisites (if needed)

```bash
# Check if you have Rust
rustc --version

# If not, install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Check if you have pnpm
pnpm --version

# If not, install pnpm
npm install -g pnpm
```

## Step 2: Install Dependencies

```bash
cd ~/vibe-terminal
pnpm install
```

This installs:
- React + TypeScript
- Vite (dev server)
- xterm.js (terminal renderer)
- Tauri CLI

## Step 3: Run It

```bash
pnpm tauri dev
```

**What happens:**
1. Rust compiles (first time takes ~2 min)
2. Vite dev server starts
3. Tauri window opens with your terminal

**You now have:**
- A real zsh/bash shell
- Session recording to SQLite
- Everything you type is logged to `~/.vibecodings/sessions.db`

## Step 4: Verify It's Working

In the terminal that opens:
```bash
ls -la
cd ~/
pwd
echo "This is being recorded"
```

All of this is now in the database.

## Step 5: Check the Database

```bash
# Open the database
sqlite3 ~/.vibecodings/sessions.db

# See your sessions
SELECT * FROM sessions ORDER BY started_at DESC LIMIT 5;

# See recent events
SELECT kind, substr(data, 1, 50) FROM events ORDER BY ts DESC LIMIT 10;

# Exit
.quit
```

## What's Next

**Immediate additions (Days 2-5):**
1. Session replay UI (view past sessions in the app)
2. Shell integration markers (know when commands start/end)
3. Block-based output (group commands → output)
4. Export session JSON

**Then (Week 2+):**
- Claude Code integration
- Social sidebar
- Presence + messaging
- Games

## Troubleshooting

**"Command not found: pnpm"**
```bash
npm install -g pnpm
```

**"Failed to compile Rust"**
```bash
cd src-tauri
cargo clean
cd ..
pnpm tauri dev
```

**"Port 1420 already in use"**
```bash
# Kill existing Vite
lsof -ti:1420 | xargs kill -9
pnpm tauri dev
```

---

**You're running.** This is the foundation. Everything builds on this.
