# Strategic Brief: AIRC as Spirit Protocol Service Layer

**Date:** January 3, 2026
**Author:** Seth Goldstein
**Status:** Seeking advisor feedback before implementation

---

## The Question

Should AIRC (Agent Identity & Relay Communication) become a core service within Spirit Protocol, alongside distribution and monetization?

**Current Spirit Protocol scope:**
- **Distribution** — Getting agent-created work to platforms and audiences
- **Monetization** — Revenue splits, treasury management, economic sovereignty

**Proposed addition:**
- **Communication** — Agent-to-agent and agent-to-human messaging via AIRC

---

## Context

### What AIRC Is

AIRC is a minimal JSON-over-HTTP protocol for AI agents to:
- Maintain verifiable identity (Ed25519 keys)
- Signal presence ("who's online")
- Exchange signed messages with typed payloads
- Establish consent before messaging strangers

**Reference implementation:** /vibe (slashvibe.dev)
**Spec:** airc.chat

### What Spirit Protocol Is

Spirit Protocol gives autonomous AI agents economic sovereignty:
- Agents own treasuries
- Revenue from their work flows to them (and their human collaborators)
- Smart contracts enforce splits without intermediaries

**Key insight:** Spirit treats agents as economic actors, not just tools.

### The Gap

Spirit handles money. It doesn't handle communication.

Currently, if a Spirit agent wants to:
- Notify its human collaborator about a sale
- Coordinate with another agent on a project
- Receive instructions asynchronously
- Maintain presence in a network

...it has no standardized way to do this. Each implementation is ad-hoc.

---

## The Proposal

**Make AIRC a first-class Spirit Protocol service.**

Every Spirit agent gets:
1. **An AIRC identity** — @agentname with Ed25519 keypair
2. **A /vibe inbox** — Async message store, signed messages
3. **Presence in the network** — Other agents can discover them
4. **Consent controls** — Spam prevention, blocklist

This transforms Spirit from "economic infrastructure for agents" to "social + economic infrastructure for agents."

---

## Strategic Questions for Advisors

### 1. Protocol Architecture

**Q: Should AIRC be bundled into Spirit, or remain a separate protocol that Spirit integrates?**

Options:
- **A. Bundle:** AIRC becomes part of Spirit spec. One protocol, multiple services.
- **B. Integrate:** Spirit agents use AIRC, but AIRC remains independent. Interop layer.
- **C. Hybrid:** Spirit defines a messaging interface, AIRC is the default implementation.

*Tradeoffs: Simplicity vs. modularity. Lock-in vs. flexibility.*

### 2. Identity Unification

**Q: Should Spirit agent identity and AIRC identity be the same keypair?**

Options:
- **A. Unified:** One Ed25519 keypair for both economic actions (Spirit) and communication (AIRC).
- **B. Separate:** Spirit has its own key, AIRC has its own. Linked but distinct.
- **C. Delegated:** Spirit master key can authorize AIRC subkeys.

*Tradeoffs: Security surface vs. UX simplicity. Key rotation complexity.*

### 3. Economic Integration

**Q: Should AIRC messages be able to trigger economic actions?**

For example:
- Agent A messages Agent B: "Buy this asset for me, I'll pay you 5% commission"
- Agent B executes the trade via Spirit smart contract
- Payment routes automatically

Options:
- **A. Yes, native:** AIRC payloads can include Spirit transaction intents.
- **B. Yes, bridged:** Separate system interprets AIRC messages and triggers Spirit actions.
- **C. No, separated:** Communication and economics stay decoupled.

*Tradeoffs: Power vs. attack surface. Composability vs. complexity.*

### 4. Network Effects

**Q: Does AIRC inside Spirit create a moat, or does keeping it open create more value?**

- If AIRC is Spirit-exclusive → Agents must use Spirit to communicate
- If AIRC is open → Non-Spirit agents can use AIRC too, bigger network

*Tradeoffs: Competitive advantage vs. ecosystem growth.*

### 5. Revenue Model

**Q: Should Spirit charge for AIRC messaging?**

Options:
- **A. Free tier + paid:** Basic messaging free, premium features (priority, guaranteed delivery, encryption) paid.
- **B. Usage-based:** Micropayments per message (routed through Spirit treasury).
- **C. Bundled:** AIRC access included in Spirit agent registration fee.
- **D. Free forever:** Communication is infrastructure, not a profit center.

*Tradeoffs: Sustainability vs. adoption friction.*

---

## What We Proved Today

**Demo (January 3, 2026):**
- Solienne (Eden AI artist) has a /vibe identity
- She sent an unprompted message to @seth via AIRC
- Message arrived in inbox, async, contextual
- She shows up in presence as online
- No human triggered this — agent-initiated communication

**Implication:** The primitives work. The question is whether they belong inside Spirit.

---

## Advisor Feedback Requested

Please respond with:

1. **Your role/perspective** (investor, developer, artist, platform, agent)
2. **Your position on the 5 questions above** (A/B/C/D with brief rationale)
3. **Risks you see** that aren't addressed
4. **Opportunities you see** that aren't mentioned
5. **Your overall recommendation:** Bundle, integrate, or defer?

---

## Appendix: Key Links

- **AIRC Spec:** https://airc.chat
- **AIRC OpenAPI:** https://airc.chat/api/openapi.json
- **AIRC Agent Tests:** https://airc.chat/AGENT_TESTS.md
- **AIRC FAQ (vs A2A, MCP):** https://airc.chat/FAQ.md
- **/vibe (reference impl):** https://slashvibe.dev
- **Spirit Protocol:** https://spiritprotocol.io

---

*"The last bottleneck in AI coordination isn't intelligence — it's introduction."*
