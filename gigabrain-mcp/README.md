# Gigabrain

**The collective memory for Claude Code builders.**

Vibe makes serious creation multiplayer.

## What is this?

Gigabrain captures *process*, not just outcomes. When you explore a problem, you leave traces—thinking artifacts like studio notes or lab notebooks. Others exploring similar terrain find your traces and build on them.

## Install

```bash
./install.sh
```

This will:
1. Ask for your handle and what you're building
2. Create `~/.vibe/config.json`
3. Add Gigabrain to your Claude Code config

## Tools

**gigabrain_explore** — Search the collective memory for related thinking
```
"What terrain are you exploring?"
→ Returns traces from others who've explored similar problems
```

**gigabrain_trace** — Leave a thinking artifact
```
- intent: What were you trying to do?
- moves: What paths did you explore?
- outcome: shipped | shipped_with_caveats | paused | still_exploring | abandoned
- reflections: What did you learn?
- open_questions: What are you still unsure about?
```

**gigabrain_who** — See who's building and what they're exploring

## Data

Traces are stored locally at `~/.vibe/gigabrain.jsonl`

Append-only, yours to keep.

## Seed traces

```bash
node seed-traces.js
```

Populates the store with example traces from fictional builders.

## Philosophy

This isn't social media. No likes, no followers, no engagement metrics.

Just builders leaving traces for other builders to find.

*Thinking in public. Building in parallel.*
