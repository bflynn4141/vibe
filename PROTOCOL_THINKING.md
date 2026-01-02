# Protocol Thinking: /vibe as Infrastructure

*The biggest possible framing*

---

## The Strategic Question

> Should /vibe be a product (ICQ/Bloomberg) or a protocol (SMTP/IRC)?

**Answer:** Both. Like email → Gmail. Web → Chrome. Fediverse → Mastodon.

---

## The Three Models

| Model | Example | Ownership | Moat | Risk |
|-------|---------|-----------|------|------|
| **Closed Product** | ICQ, Bloomberg | Full control | UX + network | Can be replaced |
| **Open Protocol** | SMTP, IRC | No control | Ubiquity | No value capture |
| **Protocol + Product** | ActivityPub/Mastodon, Matrix/Element | Shared standard, best impl | Standard-setter + UX | Complexity |

**The smartest play:** Define the open protocol. Be the reference implementation. Let others build on it. Capture value through being the best.

---

## What Would a /vibe Protocol Look Like?

### Core Primitives

```
┌─────────────────────────────────────────────────┐
│  VIBE PROTOCOL (open, model-agnostic)           │
├─────────────────────────────────────────────────┤
│  1. PRESENCE                                    │
│     - Heartbeat format                          │
│     - Status/mood vocabulary                    │
│     - Context sharing schema                    │
│     - TTL and visibility semantics              │
│                                                 │
│  2. MESSAGING                                   │
│     - Envelope format (from, to, timestamp)     │
│     - Threading/reply semantics                 │
│     - Payload types (text, structured, media)   │
│     - Delivery guarantees                       │
│                                                 │
│  3. IDENTITY                                    │
│     - Handle resolution                         │
│     - Cross-platform identity linking           │
│     - Capability discovery                      │
│     - Trust/verification levels                 │
│                                                 │
│  4. MEMORY                                      │
│     - Session summary format                    │
│     - Shared state conventions                  │
│     - Consent/privacy markers                   │
│     - Retrieval protocol                        │
│                                                 │
│  5. AGENTS                                      │
│     - Agent identification                      │
│     - Capability advertisement                  │
│     - Human/AI distinction                      │
│     - Autonomous action boundaries              │
└─────────────────────────────────────────────────┘
```

### Comparison to Existing Standards

| Domain | Existing | /vibe Equivalent |
|--------|----------|------------------|
| Web | HTTP | Presence/messaging transport |
| Email | SMTP | Message envelope format |
| Identity | OAuth/DID | Handle + capability resolution |
| Social | ActivityPub | Presence + threading semantics |
| AI | MCP, A2A | Agent capability protocol |
| Docs | llms.txt | Context/memory format |

---

## Why Open Protocol Protects You

**Fear:** "Someone will copy this and do it better"

**Reality with closed product:** Yes, they can. You race on features.

**Reality with open protocol:**
- Can't be "copied" — you ARE the standard
- Others implementing it validates you
- You win by being the reference implementation
- Anthropic can endorse the protocol without "picking favorites"

**The race shifts from:** Who builds the best chat app?
**To:** Who shapes the grammar of AI coordination?

---

## The Anthropic Play

### What Anthropic Wants
- MCP adoption (you're already using it)
- Claude Code stickiness
- Developer ecosystem growth
- Standards they can point to without owning

### What You Offer
- First real social layer for Claude Code
- Protocol they could bless as "recommended"
- Community-driven, not Anthropic-owned (less liability)
- Proves Claude Code is a platform, not just a tool

### Path to Partnership
1. **Now:** Build quietly, prove it works (you're here)
2. **20-50 users:** Document the protocol formally
3. **Signal:** Get visible Claude Code power users adopting
4. **Pitch:** "We've defined the presence/messaging layer for MCP. Want to make it official?"

---

## Cross-Platform Future

If /vibe is a protocol, not just a Claude Code feature:

| Environment | Implementation |
|-------------|----------------|
| Claude Code | MCP server (current) |
| Cursor | MCP server (same protocol) |
| VS Code + Copilot | Extension using vibe protocol |
| Windsurf | Native integration |
| CLI tools | Standalone vibe client |
| Web | Browser-based vibe client |

**The protocol travels. Implementations vary.**

---

## Ownership & Governance

### Options

| Model | Control | Speed | Legitimacy |
|-------|---------|-------|------------|
| **Benevolent dictator** | You decide | Fast | Lower |
| **Foundation** | Board decides | Slow | Higher |
| **Spec + implementations** | Market decides | Medium | Highest |

### Recommendation (For Now)

1. **Keep it simple:** You're the author, it's your spec
2. **Publish openly:** GitHub, clear license (MIT or Apache 2.0)
3. **Invite input:** "RFC" style feedback on protocol decisions
4. **Don't over-govern:** Too early for foundations/committees

**Governance can formalize later.** Right now, ship and iterate.

---

## The Naming Question

Is "vibe" the protocol name or the product name?

| Option | Protocol | Product |
|--------|----------|---------|
| A | Vibe Protocol | /vibe (by Eden) |
| B | AIP (AI Presence Protocol) | /vibe |
| C | Something neutral | /vibe |

**Suggestion:** Keep "vibe" for now. If it becomes a real standard, rename the protocol layer to something neutral. Let "/vibe" be the flagship implementation.

---

## What to Do Now

1. **Keep building the product** — Protocol without implementation is vapor
2. **Document as you go** — Every API decision is a protocol decision
3. **Stay open** — MIT license, public repo, encourage forks
4. **Watch for adoption** — If someone else implements vibe-compatible, you've won
5. **Talk to Anthropic** — When you have 50+ active users, pitch the protocol story

---

## The Biggest Framing

> "/vibe is to AI presence what SMTP was to email — the open protocol that lets AI agents and humans coordinate across any environment."

But you don't say that yet. You say:

> "We're building the social layer for Claude Code."

The protocol framing comes later, when you've earned it through usage.

---

## The Fear, Reframed

**Old fear:** "Someone will copy us"

**New frame:** "We're defining the standard. Let them implement it."

The goal isn't to own the only implementation.
The goal is to own the spec that everyone implements.

That's how SMTP won. That's how HTTP won. That's how this wins.

---

*Save this. Revisit at 50 users. For now: ship the product, watch behavior, let the protocol emerge from what works.*
