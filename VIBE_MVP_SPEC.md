# /vibe MVP Spec v2.1

**One line:** DMs inside Claude Code.

**The bet:** If a new user can get a reply without leaving their terminal, they'll use it again.

---

## The MMMVP Loop

```
1. INSTALL        curl -fsSL slashvibe.dev/install.sh | bash
2. IDENTIFY       @handle + "building: one-liner"
3. PING           vibe ping @stan
4. GET A REPLY    ← the only thing that matters
```

**MVP success criterion:** % of users who receive a reply within 5 minutes of first ping.

If we can't engineer this in seed, we don't have a product yet.

---

## Three Design Decisions (Locked)

### 1. What does `vibe ping` send?

**Decision: Fully templated, warm, one question.**

```
> vibe ping @stan

Sending to @stan...

"hey @stan — i'm seth, building mcp server for social.
 quick q: what's the hardest part of what you're building?
 reply: vibe reply p7x2 '...'"

✓ Sent
```

**Why this template:**
- Includes sender's `building:` context (so recipient knows who you are)
- One easy question (not "how are you" — something they can answer in 10 words)
- Reply command included (zero friction to respond)
- Warm but not robotic (varies slightly: "hey/hi", "quick q/one q", question rotates)

**Template variations** (server picks randomly):
```
"hey @{to} — i'm {from}, building {building}. quick q: what's the hardest part of what you're building?"
"hi @{to} — {from} here, working on {building}. one q: what are you building today?"
"hey @{to} — i'm {from} ({building}). curious: what's your stack look like?"
```

**Power user escape hatch:**
```
> vibe dm @stan "custom message here"
```

### 2. How does `building:` update?

**Decision: Manual only for MVP. Auto-detect later.**

```
> vibe set building "auth flow for privy"

✓ Updated. You're now: @seth — building auth flow for privy
```

**Why manual:**
- Simpler to ship
- No detection logic to break
- User controls their identity
- Staleness is acceptable for MVP (most people work on one thing for days)

**v1.1 enhancement (not MVP):**
- Auto-suggest from `cwd` or `package.json` name
- Prompt: "Looks like you're in `spirit-protocol`. Update your building line? (y/n)"

### 3. What's the invite flow?

**Decision: Install command + pairing ping.**

```
> vibe invite

Share this with a friend:

────────────────────────────────────────
curl -fsSL slashvibe.dev/install.sh | bash

After install, ping me:
vibe ping @seth
────────────────────────────────────────

(copied to clipboard)
```

**Why pairing:**
- Creates immediate first connection
- New user has someone to ping right away
- Inviter gets a reply (dopamine for both)
- This is the viral loop

---

## Presence Design: Always Suggest Next Action

Presence is not a dashboard. It's a call to action.

```
> vibe status

⚡ /vibe

Online now
  🟢 @stan — building file watcher
  🟢 @gene — building eden-api

Recently active
  🟡 @boreta — building audio agents (2h ago)
  🟡 @luke — building farcaster agents (yesterday)

📬 1 unread message

Next: vibe ping @stan
```

**Rules:**
- Always end with a suggested command
- Show online first, then recent (7 days)
- If inbox has unread, surface it
- Never just "3 builders vibing" — always actionable

---

## Cold Start: Seeded Directory, Not Bots

**Bots are a trap.** Claude Code users hate fake presence.

**Instead:**

1. **Seed with real responders** — You + 5 people who commit to replying fast during week 1
2. **Constrain pings to directory** — In private beta, `vibe ping` suggests only seeded users
3. **Push invite hard when empty** — If no one's around, the UI says: "Invite a friend: `vibe invite`"
4. **Show "recently active"** — Even if no one's online, there's life

**Responder roster (week 1):**
- @seth (you)
- @stan
- @gene
- @boreta
- @phil
- (2-3 more from personal invites)

These people commit to replying within 1 hour during beta.

---

## MVP Scope (Final)

### IN MVP ✅

**Identity:**
- `@handle` (required at install)
- `building:` one-liner (required at install)
- `vibe set building "..."` to update

**Presence:**
- 🟢 Online now
- 🟡 Recently active (7 days)
- Always suggests next action

**Messaging:**
- `vibe ping @user` — templated opener (default)
- `vibe dm @user "text"` — freeform (power users)
- `vibe inbox` — check messages
- `vibe reply <id> "text"` — respond

**Viral:**
- `vibe invite` — install command + pairing ping

### NOT IN MVP ❌

| Cut | Why |
|-----|-----|
| Semantic search | Not connection |
| Session auto-capture | Privacy + complexity |
| Embeddings / Gigabrain | Phase 2 |
| DNA / patterns | Phase 2 |
| Profiles beyond one-liner | Scope creep |
| Any "feed" | Buddy list > feed |
| Read receipts | Complexity |
| Threads / reactions | Complexity |
| OAuth / GitHub verification | Handle trust is fine for seed |
| Arbitrary cold DMs | Constrain to directory first |

---

## Commands (Final)

| Command | What |
|---------|------|
| `vibe status` | Who's online + recent + unread + next action |
| `vibe ping @user` | Templated opener (default path) |
| `vibe ping` | Show suggestions, pick someone |
| `vibe dm @user "text"` | Freeform message (power users) |
| `vibe inbox` | Check messages |
| `vibe reply <id> "text"` | Respond to a message |
| `vibe invite` | Generate invite + pairing command |
| `vibe set building "..."` | Update your one-liner |

**8 commands. Claude suggests them contextually.**

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Install success rate | > 85% |
| Time to first ping | < 120 seconds |
| Reply rate (5 min, seed) | > 50% |
| Reply rate (24h, general) | 30-40% |
| D7 retention | 25% |

**North star:** Replies received per week

---

## Go-to-Market

### Phase 1: Seed (Week 1)
- **Size:** 30-50 people who know each other
- **Roster:** Seth, Stan, Gene + personal invites
- **Guarantee:** Responder roster commits to 1-hour reply time
- **Focus:** Force the ping → reply loop
- **Measure:** Reply rate within 5 minutes

### Phase 2: Friends (Weeks 2-3)
- **Size:** 100 installs
- **Source:** Claude Code Discord, Twitter, friend-of-friend
- **Focus:** Reply rate without responder guarantee
- **Measure:** Organic reply rate, ghost town frequency

### Phase 3: Launch (Week 4)
- **Size:** 500 installs
- **Source:** Hacker News, Product Hunt
- **Hook:** "DMs inside your AI coding session"
- **Measure:** Viral coefficient (invites per user)

---

## The Behavioral Question

Beyond the strategic question for advisors:

> "Do you believe 'DMs + presence inside Claude Code' is a big enough wedge?"

Ask the behavioral question:

> "If you were deep in Claude Code and got a ping from a stranger working on something similar, would you reply?"

If advisors say "yes, obviously" — you have signal.
If they hesitate — probe why.

---

## Historical Framing

**What we're stealing:**
- **AIM:** Buddy list is the product. `building:` is the away message.
- **ICQ:** Lightweight ping as handshake.
- **Early Facebook:** Gating solves trust and cold start. Expand one cluster at a time.
- **WhatsApp:** Reliability beats features. Messages must arrive.
- **GitHub:** Social emerges from shared work artifacts (later, not MVP).

**What we're avoiding:**
- **MySpace:** Profile bloat and customization chaos.
- **Slack/Discord:** Rooms before 1:1 replies work.
- **Twitter:** Feed-first, connection-second.

**North-star sentence:**

> "/vibe is an IM handshake inside Claude Code; everything else is downstream."

---

## Phase 2 Boundary (What Comes After MVP)

Only after replies work:

1. **Discovery** — Search what others are building (Gigabrain)
2. **Context sharing** — Opt-in session snippets attached to messages
3. **GitHub/Discord verification** — Trusted identity layer
4. **Rooms** — Topic channels (only after 1:1 is solid)
5. **DNA** — Patterns emerge from what you build

**The lesson from history:** IM products win on reliable replies between people who trust each other. Social networks win later on identity + distribution + discovery. If you mix them too early, you get ghost-town + spam + complexity.

---

## Advisor Questions

**Strategic:**
1. Is "DMs inside Claude Code" a sufficient wedge? If not, what wedge is?
2. Will you personally install this to talk to 5 people you already know?
3. What would stop you from using it weekly? (privacy, spam, noise, unclear value)
4. Where does it spread first: friend groups, Discords, open-source projects, hackathon cohorts?

**Behavioral:**
5. If you got a ping from a stranger working on something similar, would you reply?

---

## One Thing Next

Ship `vibe ping` with the locked template + `vibe invite` with pairing.

Then seed 30 people and guarantee replies.

That's the MMMVP.

---

**/vibe** — DMs inside Claude Code.
