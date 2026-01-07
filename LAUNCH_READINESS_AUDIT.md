# /vibe Launch Readiness Audit

**Date**: January 6, 2026
**Auditor**: Claude Code
**Grade**: B- for trusted friends | C+ for open internet

---

## Executive Summary

/vibe has a working HMAC auth system and partial consent enforcement. The agent subsystem has rate limiting. However, the public APIs lack rate limiting, handles aren't verified for uniqueness, presence is always-on, and there's no abuse reporting. Ready for a controlled alpha (50-100 builders, approval-only) but not for public launch.

---

## Blockers (Must Fix Before Strangers)

### 1. No Rate Limiting on Public APIs
**Risk**: Harassment + API cost spikes. A bad actor can send 1000s of messages per minute.

**What exists**: Agent subsystem has `rate-limiter.js` with hourly/daily limits per action type. Social sync respects rate limits.

**What's missing**: `api/messages.js` and `api/presence.js` have no rate limiting. Any authenticated user can spam freely.

**Bad outcome**: Someone scripts mass DMs. Your KV costs spike. Users get flooded.

**Fix**: Add per-identity rate limits to messages API (60/min auth, 10/min unauth - matches AIRC spec §7.4)

**Time**: 2-4 hours

---

### 2. No Handle Uniqueness Verification
**Risk**: Impersonation. Two people can claim `@naval` and send messages as that handle.

**What exists**: HMAC token auth proves you own a session. Sessions are tied to handles.

**What's missing**: No check that a handle is available before registration. `POST /api/presence?action=register` just creates `session:X → handle` without checking if that handle is already registered.

**Bad outcome**: Someone registers `@sethgoldstein` and messages your friends as you.

**Fix**: Add handle registry check on registration. Return 409 if handle taken. Consider X/Twitter verification for high-value handles.

**Time**: 1-2 hours

---

### 3. Presence is Always-On (No Opt-In)
**Risk**: Stalking. Anyone can see who's online and what they're working on.

**What exists**: Presence with rich context (file, mood, builderMode).

**What's missing**: No "invisible" mode. No way to hide from specific users. No privacy settings.

**Bad outcome**: User gets harassed, can't hide their online status.

**Fix (minimum)**: Add `visible: true|false` field to presence. Filter invisible users from `GET /api/presence`. Allow per-user blocking from presence.

**Time**: 2-3 hours

---

### 4. No Abuse Reporting Path
**Risk**: No recourse for harassment victims. No audit trail for disputes.

**What exists**: Block functionality works (`action: block` in consent API).

**What's missing**:
- No "report" action (report + block)
- No audit log of reports
- No mute (temporary block)
- No admin visibility into complaints

**Bad outcome**: Someone gets harassed, blocks the user, but you never know it happened. Pattern of abuse goes undetected.

**Fix**: Add `action: report` to consent API. Store reports in KV with timestamp + evidence. Weekly report digest for admin.

**Time**: 3-4 hours

---

### 5. Unbounded Message Retention
**Risk**: Privacy liability. Old messages never expire.

**What exists**: `INBOX_LIMIT = 100,000`, `THREAD_LIMIT = 50,000`. DELETE disabled.

**What's missing**: No TTL on messages. No user-initiated delete. No retention policy.

**Bad outcome**: User wants old conversation deleted. You can't help them. GDPR implications.

**Fix (minimum for alpha)**: Document retention policy. Add `DELETE /api/messages/:id` for users to delete their own sent messages.

**Time**: 2 hours

---

## Controls Already in Place

| Control | Status | Notes |
|---------|--------|-------|
| HMAC auth | ✅ Working | Timing-safe comparison, session-to-handle binding |
| Consent system | ✅ Working | request/accept/block flow, grandfathering for existing threads |
| Agent rate limits | ✅ Working | `rate-limiter.js` with hourly/daily caps per action |
| Message length cap | ✅ Working | 2000 char limit on text |
| System account bypass | ✅ Documented | `solienne`, `vibe`, `scout` bypass consent |
| Replay protection | ✅ Partial | AIRC signatures have 5-min timestamp window |

---

## Launch Recommendation

### Option A: Fix Blockers First (Recommended)
- Fix #1 (rate limiting) and #2 (handle uniqueness) - 3-6 hours
- Document #3 (presence) and #5 (retention) as known limitations
- Defer #4 (abuse reporting) to post-launch
- Launch to 50-100 builders with approval-on-request

### Option B: Hard Cap Alpha
- Keep current code
- Manual approval for all installs (no public link)
- Hard cap at 50 users
- Kill switch ready (revoke all sessions via KV flush)
- Accept risk and learn fast

### Pre-Launch Checklist (Either Option)

- [ ] Kill switch documented and tested
- [ ] Rate limiting on messages API (Option A only)
- [ ] Handle uniqueness check (Option A only)
- [ ] Retention policy documented
- [ ] "How to report abuse" in README
- [ ] Monitoring: alert on >100 messages/hour from single user

---

## Appendix: Code References

| Component | File | Key Lines |
|-----------|------|-----------|
| Consent API | `api/consent.js` | Full AIRC consent flow |
| Message auth | `api/messages.js:431-469` | Token verification |
| Agent rate limiter | `agents/core/rate-limiter.js:17-40` | Limit definitions |
| Presence TTL | `api/presence.js:68` | `PRESENCE_TTL = 300` (5 min) |
| Session TTL | `api/presence.js:71` | `SESSION_TTL = 3600` (1 hour) |
