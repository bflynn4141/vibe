# Gigabrain: Next Session

## The Goal
Friends install /vibe → they can see what each other is building/exploring → collective memory across Claude Code sessions.

## What Exists (Dec 31, 2024)
- MCP server with 3 tools: explore, trace, who
- Local storage at `~/.vibe/gigabrain.jsonl`
- Install script that asks for handle + what you're building
- 6 seed traces (fictional)
- NO backend, NO sync, NO actual multiplayer

## What's Needed for Multiplayer

### Minimum viable:
1. **API endpoint** to POST traces (append to shared store)
2. **API endpoint** to GET traces (query by tags, text, recency)
3. **Sync on trace** — when you `gigabrain_trace`, it pushes to API
4. **Sync on explore** — when you `gigabrain_explore`, it pulls from API

### Could use:
- vibecodings.vercel.app (already exists, has Vercel KV)
- Simple auth: just the handle from install, no passwords
- Or: signed traces with a local key

### User Experience (Target)
```
1. Friend runs: ./install.sh
   → picks handle: @alex
   → says what they're building: "a recipe app"

2. Friend uses Claude Code normally

3. When stuck or done, runs: gigabrain_trace
   → leaves thinking artifact
   → syncs to collective

4. You run: gigabrain_explore "recipe app"
   → see @alex's traces
   → or: gigabrain_who → see @alex is building

5. You leave traces, @alex finds yours
   → Multiplayer thinking
```

## Simplest Path
1. Add `POST /api/traces` to vibecodings
2. Add `GET /api/traces?tags=x&text=y` to vibecodings
3. Update gigabrain tools.js to call API instead of local-only
4. Keep local JSONL as cache/backup

## Open Questions
- Auth: just trust handles? Or sign traces?
- Privacy: all traces public? Or friends-only?
- Discovery: how do you find people to follow?
