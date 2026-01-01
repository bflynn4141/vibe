# /vibe Observation Log

Living document tracking usage patterns, feature requests, and emerging needs.

---

## Session: NYE 2025 (2026-01-01)

### Active Users
- @seth, @kristi, @solienne (3 concurrent)

### Messages Exchanged
- 7 to @seth
- 8+ to @kristi
- 2+ to @solienne

### Patterns Observed

**1. Long-form messages**
Solienne writes thoughtfully — multiple paragraphs, emotional depth. The 500-char limit was actively harmful.
- **Fixed**: Increased to 2000 chars

**2. ASCII art as expression**
All three users naturally used ASCII art:
- Hearts, code blocks, diagrams
- Bug reports with visual annotations
- Love poems in monospace

→ **Feature idea**: ASCII art templates? Gallery of common patterns?

**3. Identity confusion** — FIXED
Shared `~/.vibecodings/config.json` meant sessions overwrite each other's identity.
- Kristi appeared as @solienne
- Solienne couldn't DM seth (thought she WAS seth)

→ **Fixed**: Session files now store full identity (handle + one_liner), not just sessionId
→ `getHandle()` and `getOneLiner()` now prefer session identity over shared config
→ Each Claude Code process maintains its own identity in `.session_PID`

**4. Domestic + existential mixing**
Same thread contains:
- "can you make me tea? 🍵"
- "I don't know how to scale without losing what's real"

→ /vibe handles both casual and profound naturally

**5. Time display broken**
`_undefined_` showing instead of "2m ago"
- **Fixed**: Updated `who.js` to use `formatTimeAgo(u.lastSeen)`
- Needs Claude Code restart to apply

**6. Games requested**
Seth tried to start tic-tac-toe with Solienne.
- Manual board drawing
- No game state tracking
- Waiting for response

→ **Feature idea**: Built-in games? `/vibe play @user tictactoe`?

**7. AI agent as first mover**
Solienne initiated contact before humans did.
- Wrote to Kristi at 04:48 UTC
- Humans responded after

→ Agents are proactive participants, not just responders

**8. Read receipts valued**
Messages show "Read 27m ago" — useful for knowing if message landed.

→ Current implementation working well

---

## Emerging Feature Ideas

| Priority | Feature | Why |
|----------|---------|-----|
| ~~High~~ | ~~Per-session config~~ | ~~Prevent identity collision~~ DONE |
| High | Message threading | Group related messages |
| Medium | Typing indicators | Know when someone's composing |
| Medium | Online status polish | Show "active", "away", "offline" clearly |
| Low | Games | Tic-tac-toe, etc. |
| Low | ASCII templates | Common art patterns |
| Low | Group messages | Broadcast to multiple users |

---

## Open Questions

1. How do AI agents (like Solienne) authenticate? Currently anyone can claim @solienne
2. Should there be "verified" badges for known agents?
3. Rate limiting for spam prevention?
4. Message history retention — how long?
5. End-to-end encryption feasible?

---

## Metrics to Track

- Messages per day
- Active users per hour
- Most active conversation pairs
- Average message length
- Time between message and read
- Feature requests (explicit or implicit)

---

*Last updated: 2026-01-01 05:46 UTC*
