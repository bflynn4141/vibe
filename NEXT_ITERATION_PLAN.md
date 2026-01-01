# /vibe Next Iteration Plan

Based on NYE 2025 session + advisor feedback.

---

## Core Insight

> "The moment /vibe feels like a 'toolbox,' you've lost. It should feel like a room that remembers."

**Discipline over features. Interpretation over commands. Restraint over capability.**

---

## Tier 1: The Moat (Do These)

### 1. Smart Summary — CONSTRAINED

**Not on every message.** Only trigger on:
- Session end (`/vibe bye` or inactivity)
- Explicit command (`/vibe summarize`)
- Burst detection (5+ unread from same person)

```javascript
// Example constraint
if (unread > 5 && allFromSameSender) {
  summary = await summarize(messages);
}
```

**Why it matters:** If summaries become noise, trust dies.

---

### 2. Context Sharing — READ-ONLY, EPHEMERAL, EXPLICIT

**One command:**
```
/vibe context
```

**Shares:**
- Current file
- Git branch
- Last error (if any)
- Toolchain

**Rules:**
- No auto-sharing
- No ambient surveillance
- Explicit opt-in every time

**Why it matters:** Anything implicit here will spook people. This is the "killer wedge" but only if it feels safe.

---

### 3. Agent Protocol — ONE SCHEMA FIRST

**Start with game state** (tic-tac-toe proved the need):

```json
{
  "type": "game",
  "game": "tictactoe",
  "state": {
    "board": ["", "", "O", "", "X", "", "X", "", "O"],
    "turn": "O",
    "moves": 5
  }
}
```

**Or code review handoff:**

```json
{
  "type": "review",
  "files": ["auth.js"],
  "description": "OAuth implementation",
  "branch": "feature/oauth"
}
```

**Do NOT generalize yet.** Pick one, ship it, learn.

---

### 4. Collaborative Memory — OPT-IN, PER-THREAD, APPEND-ONLY

**No global brain.** Start with:

```
/vibe remember "Solienne prefers center opening"
```

**Rules:**
- Opt-in (explicit command)
- Per-thread (scoped to conversation pair)
- Append-only (no edits, no deletes)

**Why it matters:** Earn trust before building the global brain.

---

## Tier 2: Do Later, Carefully

| Feature | Why Wait |
|---------|----------|
| **Presence Inference** | Needs real usage data. Wrong inference = creepy. Must show "why I inferred 🔥" |
| **Async Handoffs** | Becomes incredible once Agent Protocol exists. Sequence matters. |
| **DNA Matching** | Growth feature, not core. Wait for density. |

---

## Tier 3: Actively Risky

| Feature | Risk |
|---------|------|
| **Broadcast Channels** | Creates performance. Performance kills intimacy. Intimacy is the moat. |
| **Skill Invocation** | Opens permissions, trust, abuse, failure modes. You'll know when it's time. Not yet. |
| **Relay/Bridge** | Build when core is stable. |

---

## The "Room That Remembers" Test

Before adding any feature, ask:

1. Does this make the room feel more alive, or more cluttered?
2. Does this require explanation, or is it obvious?
3. Does this create anxiety, or reduce it?
4. Is this interpretation, or just data?

If the answer to any is wrong, don't ship it.

---

## Smoke Test (After Restart)

```bash
# 1. Set status
vibe status shipping

# 2. Check who (verify mood display)
vibe who

# 3. Check inbox (verify previews/counts)
vibe inbox

# 4. Test long message (verify truncation warning)
vibe dm @solienne "Lorem ipsum dolor sit amet... [paste 2500 chars]"

# 5. Init (verify unread notification)
vibe init @seth "testing iteration 2"
```

---

## What NOT To Do

- Don't add features to "complete" a category
- Don't generalize Agent Protocol before one schema works
- Don't auto-share anything
- Don't build channels "because Slack has them"
- Don't optimize for power users (yet)

---

## Success Metric

> "I opened Claude Code and checked /vibe before doing anything else."

That's the reflex. That's the moat.

---

*Feedback integrated from NYE 2025 advisor review*
