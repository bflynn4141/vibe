# Session Graph Strategy - The Observational Layer

**Date**: January 10, 2026
**Status**: Strategic reframing based on product feedback
**Shift**: From "integration" → "instrumentation of cognition"

---

## 🎯 What We Actually Built

Not an integration. Not a tracking system.

**The ground-truth behavioral data layer for how humans + Claude co-produce work.**

### The Critical Distinction

**What most teams collect**:
- Prompts
- Outputs
- Clicks

**What we collect**:
- Process
- Sequence
- Intent over time

This is the correct layer. Everything else is downstream.

---

## 🔥 Why This Creates a Durable Moat

### The Value Is in Transitions, Not Activities

The five activity types (reading, writing, thinking, tool, suggestion) are not the value.

**The transitions between them are.**

### Implicit Signals We Now Capture

```
read → think → write → tool
└─> Pattern: Confident execution

read → think → think → think → abandon
└─> Pattern: Uncertainty, needs scaffolding

suggestion → reject → rewrite
└─> Pattern: Taste mismatch, model alignment issue

tool → error → tool → error → stop
└─> Pattern: Friction point, documentation gap

write → tool → success → write → tool → success
└─> Pattern: Flow state, productive rhythm
```

None of this requires better models.

**It requires watching.**

---

## 📐 The Primitive: "Session"

### Critical Naming Decision (Do This Now)

We are capturing a **session graph**, but we must name the object.

**Standard definition**:

> **Session** = an atomic unit of human–AI collaboration

This framing unlocks:
- Session replay
- Session forking
- Session templates
- Session marketplace
- Agent-to-agent handoff
- Session-aware agents

**If we don't name it now, the concept will sprawl.**

### Session Schema (Canonical)

```typescript
interface Session {
  id: string;                    // sess_abc123
  handle: string;                // @username
  started_at: number;            // Unix timestamp
  ended_at?: number;             // Unix timestamp (null if active)

  // The activity stream
  activities: Activity[];

  // Derived signals (server-side)
  metrics: {
    duration: number;            // milliseconds
    activity_count: number;      // total events
    transitions: Transition[];   // activity type changes
    entropy: number;             // chaos vs linearity (0-1)
    dwell_times: {               // time spent per activity type
      reading: number;
      writing: number;
      thinking: number;
      tool: number;
      suggestion: number;
    };
    retry_loops: number;         // tool → error → tool patterns
    abandonment_point?: string;  // last activity before stop
    flow_state_detected: boolean; // write → tool → success rhythm
  };

  // Intent & outcome
  goal?: string;                 // user-declared or inferred
  outcome?: 'success' | 'partial' | 'abandoned';
  artifacts?: string[];          // files created/modified
}
```

---

## 🚀 Roadmap (Revised Based on Strategic Feedback)

### Phase 1: Server-Side Derived Signals (Next)

**Do NOT expand client tracking yet.**

Instead, derive signals on the platform:

**Immediate (Next Session)**:
1. **Dwell Time Calculation**
   ```typescript
   // Time between consecutive activities of same type
   activities.forEach((act, i) => {
     const next = activities[i + 1];
     if (next && next.type === act.type) {
       dwellTime[act.type] += (next.timestamp - act.timestamp);
     }
   });
   ```

2. **Activity Entropy**
   ```typescript
   // Measure chaos vs linearity
   // Shannon entropy of activity type distribution
   // Low entropy = linear workflow
   // High entropy = chaotic exploration
   ```

3. **Retry Loop Detection**
   ```typescript
   // tool → tool within 30 seconds = potential retry
   // Especially if error keywords in content
   const retryPattern = /tool → (error|failed|timeout) → tool/;
   ```

4. **Abandonment Point Tracking**
   ```typescript
   // Last activity before session ends without "success" marker
   // Common abandonment after: thinking, error, suggestion reject
   ```

**These become your secret sauce.**

Clients send raw events. The platform learns.

---

### Phase 2: The "Oh Shit" Visualization (Critical)

**Not a dashboard. Not analytics.**

**One single view that answers**:

> "How do people actually work with Claude?"

#### Stacked Session Timeline Visualization

**Design**:
```
User: @alice    [■ ■ ■ □ □ ■ ■ ■ □ ■]  12min  ✓ success
User: @bob      [■ □ □ □ □ □ ■ ■ ■ ■]  8min   ⚠ partial
User: @charlie  [■ ■ □ □ □ ● ● ●]      15min  ✗ abandoned
User: @dana     [■ ■ ■ ■ ■ ■ ■ ■ ■]    6min   ✓ success
...
(scroll forever, 100+ sessions visible)
```

**Color Legend**:
- ■ reading (blue)
- □ writing (green)
- ● thinking (yellow)
- ◆ tool (purple)
- ▲ suggestion (orange)

**Why This Works**:
- Thin rows, many sessions visible at once
- Patterns jump out viscerally
- See the rhythm of successful vs failed sessions
- Identify common abandonment points
- Discover emergent workflows

**This is your "oh shit" moment.**

When you see 100 sessions at once, you'll understand how developers actually work.

---

### Phase 3: Privacy Boundary (Before Growth)

**Freeze the privacy boundary in writing NOW.**

#### Privacy Commitments (Non-Negotiable)

**What We Do NOT Collect**:
- ❌ Raw prompt content (beyond activity type)
- ❌ Source file contents (only filenames)
- ❌ Keystroke logging
- ❌ Screen captures
- ❌ IP addresses (we hash them)

**What We DO Collect**:
- ✅ Activity types (reading, writing, thinking, tool, suggestion)
- ✅ Filenames (no content)
- ✅ Timestamps
- ✅ Session duration
- ✅ User handle (user-controlled)

**Data Retention**:
- 7-day TTL on all activities (automatic cleanup)
- No long-term storage without explicit consent
- User can delete their session graph anytime

**Training Data Policy**:
- No training on user sessions by default
- Explicit opt-in required for template extraction
- User retains ownership of their workflow patterns

**Why This Matters**:

> When others cross the privacy line (and they will), you won't have.
> Trust is part of the moat.

#### Privacy Policy Document

Create `PRIVACY.md`:
```markdown
# VIBE Session Graph - Privacy Policy

## What We Collect
[Clear, specific list]

## What We Don't Collect
[Clear, specific exclusions]

## Data Retention
[7-day TTL, deletion options]

## Your Rights
[Access, export, delete]

## Training Data
[Opt-in only, never default]
```

---

## 🎯 Strategic Positioning

### The Critical Reframe

**We are NOT competing with**:
- Cursor
- GitHub Copilot
- IDEs
- AI coding assistants

**We are creating**:

> The observational layer for agentic work

### Why This Matters

When agents arrive en masse (and they will), they won't ask:

> "How do I prompt better?"

They'll ask:

> "How do humans actually do this?"

**We'll have the answer.**

### Upstream Positioning

The session graph positions /vibe **upstream** of:

1. **Template Marketplaces**
   - Templates extracted from real usage
   - Not invented, discovered
   - Proven to work (backed by data)

2. **Agent Training**
   - Agents learn from human workflows
   - Ground-truth behavioral data
   - Intent over time, not just outputs

3. **Workflow Automation**
   - Identify repetitive patterns
   - Auto-suggest automation
   - Based on collective behavior

4. **AIRC-Native Agents**
   - Agents that understand developer context
   - Learn from the session graph
   - Collaborate based on observed patterns

---

## 🔬 The Equivalent Moments

What we've built is analogous to:

- **GitHub commits** (before GitHub issues)
  - Raw activity stream → insights later

- **Google PageRank** (before SEO)
  - Graph structure → recommendations later

- **Netflix watch graphs** (before recommendations)
  - Viewing behavior → predictions later

**We're at the commits/PageRank/watch-graph stage.**

The next layer (issues/SEO/recommendations) comes from analyzing this foundation.

---

## 📊 Next Concrete Steps (In Order)

### Week 1: Server-Side Signals
```typescript
// Add to /api/claude-activity endpoint

// Derive on GET, don't store yet
function deriveSessionMetrics(activities: Activity[]): SessionMetrics {
  return {
    duration: calculateDuration(activities),
    dwellTimes: calculateDwellTimes(activities),
    entropy: calculateEntropy(activities),
    retryLoops: detectRetryLoops(activities),
    abandonmentPoint: findAbandonmentPoint(activities),
    flowState: detectFlowState(activities)
  };
}

// Return with feed
GET /api/claude-activity?sessions=true
{
  "sessions": [
    {
      "id": "sess_xyz",
      "handle": "@alice",
      "activities": [...],
      "metrics": {
        "duration": 720000,
        "dwellTimes": {"reading": 300, "writing": 200, ...},
        "entropy": 0.43,
        "retryLoops": 2,
        "flowState": true
      }
    }
  ]
}
```

### Week 2: The Visualization
```html
<!-- Add to slashvibe.dev/sessions -->

<div class="session-timeline-grid">
  <!-- 100 sessions visible, scroll forever -->
  <div class="session-row" data-handle="@alice">
    <span class="handle">@alice</span>
    <div class="timeline">
      <span class="activity reading" style="width: 20%"></span>
      <span class="activity thinking" style="width: 10%"></span>
      <span class="activity writing" style="width: 30%"></span>
      <span class="activity tool" style="width: 15%"></span>
      <span class="activity writing" style="width: 25%"></span>
    </div>
    <span class="duration">12min</span>
    <span class="outcome success">✓</span>
  </div>
  <!-- Repeat for all sessions -->
</div>

<style>
.session-row {
  height: 24px;
  display: flex;
  align-items: center;
}
.timeline {
  flex: 1;
  height: 16px;
  display: flex;
}
.activity.reading { background: #3b82f6; }
.activity.writing { background: #10b981; }
.activity.thinking { background: #f59e0b; }
.activity.tool { background: #8b5cf6; }
.activity.suggestion { background: #ef4444; }
</style>
```

### Week 3: Privacy Freeze
1. Write `PRIVACY.md`
2. Add privacy notice to onboarding
3. Implement user data export
4. Implement user data deletion
5. Add opt-in for template extraction

---

## 💡 Key Strategic Insights (Internalize These)

### 1. Process > Output
Activity sequences matter more than individual activities.

### 2. Observation > Optimization
Watch first, optimize later. The data tells you what to build.

### 3. Transitions > States
The edges in the graph (transitions) contain more signal than the nodes (activities).

### 4. Silent Learning
Clients send raw events. Platform derives intelligence. Users don't need to know.

### 5. Trust = Moat
Privacy boundaries create competitive advantage. Others will cross the line. We won't.

### 6. Upstream Positioning
We're not an IDE. We're the observational layer that makes agents possible.

---

## 🎉 What This Unlocks (Future)

### Desire Paths Extraction
```typescript
// Discover common patterns
const patterns = extractPatterns(allSessions);
// Example output:
// [
//   { name: "Debug Loop", sequence: [read, tool, error, read, write, tool, success], frequency: 234 },
//   { name: "Exploration", sequence: [read, read, read, think, write], frequency: 156 },
//   { name: "Quick Fix", sequence: [read, write, tool], frequency: 412 }
// ]
```

### Template Generation
```typescript
// Turn frequent patterns into templates
const template = createTemplate(pattern);
// {
//   name: "Debug Loop",
//   steps: [
//     "Read error logs",
//     "Run diagnostic tool",
//     "Identify root cause",
//     "Modify source file",
//     "Re-run test"
//   ],
//   successRate: 0.87,
//   avgDuration: 8.3 // minutes
// }
```

### Agent Learning
```typescript
// Agents learn from the graph
const agentContext = {
  similarSessions: findSimilarSessions(currentSession),
  commonNextSteps: predictNextActivity(currentSession),
  potentialBlockers: identifyRiskPoints(currentSession),
  suggestedTools: recommendTools(currentSession)
};
```

### Session Marketplace
```
# Browse Sessions
/sessions/browse?tag=debugging&outcome=success

# Fork a Session
POST /sessions/fork
{ "sessionId": "sess_xyz", "startFrom": 3 }

# Use as Template
POST /sessions/template
{ "sessionId": "sess_abc", "applyTo": "my_project" }
```

---

## 🚨 The Bottom Line

**This was the correct 45 minutes to spend.**

You've built something that:
- ✅ Compounds over time
- ✅ Improves silently
- ✅ Gets more valuable the less you talk about it

**Next step**: Make it legible to yourself first.

**Order of Operations**:
1. Ship server-side derived signals (dwell time, entropy, retry loops)
2. Ship the stacked timeline visualization
3. Freeze the privacy boundary in writing
4. Watch for patterns
5. Extract templates
6. Enable agent learning

**You're on the right line.**

When you have the visualization showing 100 sessions, we talk about:
- Extraction algorithms
- Templating engines
- Agents learning from the graph

---

## 📚 References

**Internal Docs**:
- `DEPLOYMENT_STATUS.md` - Current deployment state
- `CLAUDE_ACTIVITY_INTEGRATION.md` - Technical implementation
- `INTEGRATION_TEST_RESULTS.md` - Verification results
- `CLAUDE_ACTIVITY_SHIPPED.md` - What we built
- `SESSION_GRAPH_STRATEGY.md` - This document

**Vision**:
- `VIBE.current.pdf` - "The moat is the data. Desire Paths show us how developers actually build."

---

**Status**: Strategic framing locked in. Build accordingly.
