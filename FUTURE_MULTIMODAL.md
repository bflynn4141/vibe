# Future: Multimodal Expressiveness

*Thinking ahead while executing in the present*

**Status:** NOT NOW. Captured for when the time is right.

---

## The Goal

"To just vibe" should be a **feeling**, not a feature.

Like "Netflix and chill" — but creative, curious, entrepreneurial, collaborative, team-oriented.

People should feel **closer emotionally**. That's what multimodal unlocks.

---

## The Constraint

> Stay inside the terminal. Don't break the flow.

No browser popups. No external apps. No "click here to see."

Everything should feel native, fast, surprising-but-inevitable.

---

## Layer 1: Sound (Soonish)

### System Notifications
- Subtle audio cues when DM arrives
- Different tones for different senders (agents vs humans?)
- Muted by default, opt-in

### Custom Sounds
- Let users attach sounds to messages ("send this with a chime")
- ASCII bell character already works: `\a`
- Could extend with embedded audio references

### Voice (11 Labs)
- @solienne could *speak* her responses
- "Read this message aloud"
- Voice memos in DMs (record → transcribe → send text + audio link)
- TTS for summaries ("give me the vibe check, spoken")

**Terminal constraint:** Audio plays locally, doesn't require leaving terminal.

---

## Layer 2: Images (Later)

### What We Already Have
- ASCII art (working! used for tic-tac-toe)
- Emojis (mood indicators, reactions)
- Unicode box drawing for structure

### Nanobanana Integration
- Generate small, fast images
- Constrain to terminal-friendly sizes
- Could display inline with iTerm2/Kitty image protocols
- Fallback: ASCII art version + link

### Ideas
- Avatar generation for users
- Mood visualizations
- "Draw what you're feeling" → ASCII interpretation
- Generative art in DMs (like the haiku request)

**Terminal constraint:** Use sixel/iTerm2 inline images where supported, ASCII fallback elsewhere.

---

## Layer 3: Rich Presence (Future)

### Beyond Text Status
- Ambient soundscapes ("Seth is in deep focus mode" → lo-fi plays)
- Visual presence indicators (pulsing, color)
- "Vibe matching" — similar moods cluster visually

### Emotional Layer
- Sentiment in messages affects presentation
- Celebrations feel celebratory
- Struggles feel supported

---

## Sequencing

| Phase | Focus | Multimodal |
|-------|-------|------------|
| **Now** | 1-1 DMs, presence, memory | ASCII art, emojis only |
| **20 users** | Retention, natural behavior | Maybe: notification sounds |
| **50 users** | Patterns emerge | Maybe: voice messages |
| **100 users** | Scaling, groups | Images, richer presence |

---

## The Discipline

> "My prob is I always see ahead"

The answer isn't to stop seeing ahead. It's to:

1. **Capture the vision** (this doc)
2. **Sequence it properly** (phases above)
3. **Execute in the present** (1-1 DMs, retention)
4. **Let usage pull features** (don't push)

We operate at both levels — vision and execution — with proper context and memory.

That's the team superpower.

---

## Trigger Points

**Add sound when:**
- Users complain about missing messages
- Engagement drops because async feels dead

**Add images when:**
- ASCII art becomes a thing users do naturally
- Someone asks "can I send a picture?"

**Add voice when:**
- Reading long summaries feels tedious
- Users want to send quick thoughts without typing

---

## The Vibe

```
┌─────────────────────────────────────┐
│  Not a chat app with features.     │
│  A place that feels alive.         │
│                                     │
│  Sound = presence                   │
│  Images = expression                │
│  Voice = intimacy                   │
│                                     │
│  All in service of:                 │
│  "Oh, you were already here."       │
└─────────────────────────────────────┘
```

---

*Saved for when the time is right. Now: focus on 1-1, watch retention, let behavior emerge.*
