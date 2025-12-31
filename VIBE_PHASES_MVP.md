# Vibe MVP: Two Phases in Parallel (MCP-first)

## North Star

**Gigabrain is the product. `/vibe` is a surface. MCP is the delivery mechanism inside Claude Code.**

Vibe makes serious creation multiplayer by adding:
- **Phase 1:** a basic communication protocol (identity/presence/DM) inside Claude Code
- **Phase 2:** collective intelligence (traces/resonance/collaboration) surfaced through the same MCP surface

We build both in parallel, but **Phase 1 ships first** and de-risks the surface.

---

## Layer Model (keep this straight)

```
┌─────────────────────────────────────────────┐
│              ENVIRONMENTS                    │
│  Claude Code    Web (eden.art)   Discord     │
└───────────────▲───────────▲───────────▲─────┘
                │           │           │
┌───────────────┴───────────┴───────────┴─────┐
│                 /VIBE (SURFACE)              │
│  Phase 1: Presence • Identity • DM           │
│  Phase 2: Traces • Resonance • Collaboration │
└───────────────▲─────────────────────────────┘
                │
┌───────────────┴─────────────────────────────┐
│               GIGABRAIN (PRODUCT)            │
│  • Collective memory                         │
│  • Knowledge traces                          │
│  • Lineage / patterns                        │
│  • Social graph over thinking               │
└───────────────▲─────────────────────────────┘
                │
┌───────────────┴─────────────────────────────┐
│           INFRA / PROTOCOL LAYER             │
│  MCP servers  •  APIs  •  Storage            │
└─────────────────────────────────────────────┘
```

---

## Phase 1 — Communication Protocol (Ship Fast)

### Goal
Enable Claude Code users to DM each other *in-flow*.

### What's in scope (hard yes)
- Identity: set handle + one-liner
- Presence: see who's online / active
- Ping: lightweight "tap" to pull someone's attention
- DM: send/receive short messages inside Claude Code

### What's out of scope (hard no)
- Traces, summaries, indexing, search
- Resonance detection
- Agents
- Any "feed"

### MVP Success Criteria (Phase 1)
- 20 trusted alpha users installed
- At least 10 meaningful DMs/day across the group
- At least 3 instances/week where a DM prevented a context switch to Discord
- Retention: users run `vibe who` or check inbox at least 3 days/week

### Product Principle
**Phase 1 must be legible in 60 seconds.**

---

## Phase 2 — Collective Intelligence (Dark Launch)

### Goal
Make thinking persistent, searchable, and collaborative once people are already present.

### Core primitives
- **Trace:** a short "studio note" about what you explored
- **Explore:** discover who else explored the same terrain
- **Resonance:** proactive surfacing of related thinking
- **Caretaker agents:** domain stewards that summarize patterns

### Product Principle
**Phase 2 is invitation, not rescue.**

The tone is: "nearby minds", "shared terrain", "threads you can pick up"
Not: "you're stuck", "here's the fix"

---

## Tech Stack

### MCP is primary
- /vibe lives inside Claude Code
- Users don't switch apps
- Social + intelligence feels native

### APIs power persistence
- Multi-user presence
- Message storage
- Trace sync (Phase 2)

### Skills improve output
- Draft traces
- Summarize sessions
- Internal glue, not GTM

### Agents emerge later
- Hold lineage
- Summarize domains
- Phase 2+ value

---

## Phase 1 Commands

```
vibe init          → set handle + one-liner
vibe who           → see who's online
vibe ping @handle  → lightweight nudge
vibe dm @handle    → send message
vibe inbox         → see unread messages
vibe open @handle  → thread view
vibe status        → your identity + visibility
vibe hide          → disable presence
```

## Phase 2 Commands (dark)

```
vibe terrain       → set current exploration area
vibe trace         → leave a thinking artifact
vibe explore       → find related traces
vibe resonance     → toggle proactive nudges
```

---

## Success Metric (Phase 1)

**Did someone DM another human inside Claude Code today?**

That's it.
