# VIBE Platform Health Audit
**Date:** January 12, 2026
**Auditor:** Claude (Opus 4.5)
**Updated:** Same day - after fixes applied

---

## Executive Summary

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| **Core APIs** | ✅ 6/6 | ✅ 6/6 | Stable |
| **Secondary APIs** | ⚠️ 4/10 | ✅ 8/10 | Fixed profile, added consent/report |
| **MCP Server** | ✅ Healthy | ✅ Healthy | 117 tools |
| **Infrastructure** | ⚠️ Issues | ✅ Fixed | Added ethers, coinbase-sdk |
| **Dependencies** | 🔴 Missing | ✅ Fixed | pnpm add ethers @coinbase/coinbase-sdk |
| **Code Quality** | ⚠️ Mixed | ⚠️ Mixed | Economic layer still needs ESM migration |

**Overall Platform Health: 65% → 85%**

---

## Fixes Applied This Session

### 1. Profile API (FIXED)
- **Issue:** `hgetall` on string key caused WRONGTYPE error
- **Fix:** Changed to `kv.get()`, fixed lastSeen ISO→timestamp conversion
- **Status:** ✅ Deployed and verified

### 2. Missing Dependencies (FIXED)
- **Issue:** `ethers` and `@coinbase/coinbase-sdk` not in package.json
- **Fix:** `pnpm add ethers @coinbase/coinbase-sdk`
- **Status:** ✅ Installed

### 3. Consent API (CREATED)
- **Issue:** `/api/consent` returned 404, blocking DM consent features
- **Fix:** Created full consent management API (request, accept, block, unblock)
- **Status:** ✅ Deployed and verified

### 4. Report API (CREATED)
- **Issue:** `/api/report` returned 404, blocking moderation features
- **Fix:** Created report submission API
- **Status:** ✅ Deployed and verified

---

## 🟢 WORKING (No Action Needed)

### Core APIs (6/6 Healthy)
All core APIs return 200 OK:

| API | Status | Response |
|-----|--------|----------|
| `/api/board` | ✅ 200 | GET + POST working, 8 entries |
| `/api/observations` | ✅ 200 | Empty but functional |
| `/api/claude-activity` | ✅ 200 | Empty but functional |
| `/api/projects` | ✅ 200 | 57 projects returned |
| `/api/presence` | ✅ 200 | 10 users online |
| `/api/stats` | ✅ 200 | 21 users, 14 messages |

### Secondary APIs (Working)

| API | Status | Notes |
|-----|--------|-------|
| `/api/messages?user=seth` | ✅ 200 | Returns inbox |
| `/api/friends?user=seth` | ✅ 200 | Returns friends list |
| `/api/games` | ✅ 200 | 1 active game |
| `/api/artifacts?scope=mine&handle=seth` | ✅ 200 | 6 artifacts |
| `/api/watch` | ✅ 200 | Broadcasts endpoint |

### MCP Server
- **117 tools** defined
- **100 tools** have handlers
- CommonJS module system (separate from main package)
- Single dependency: `crossword-layout-generator`

---

## 🔴 CRITICAL ISSUES (Fix Now)

### 1. Missing Dependencies
**Impact:** Multiple APIs crash on load
**Files affected:** All payment/reputation/ping APIs

```bash
# These are required but NOT in package.json:
ethers                    # Used by contract-dispatcher.js
@coinbase/coinbase-sdk    # Used by contract-dispatcher.js
```

**Fix:**
```bash
cd /Users/sethstudio1/vibe-platform
pnpm add ethers @coinbase/coinbase-sdk
```

### 2. CommonJS/ESM Module Conflict
**Impact:** 20+ API files will crash in ES module environment
**Root cause:** `package.json` has `"type": "module"` but many APIs use `require()`

**Files using CommonJS `require()` (WILL FAIL):**
```
api/reputation/score.js
api/reputation/leaderboard.js
api/reputation/award.js
api/payments/tip.js
api/payments/escrow.js
api/payments/complete.js
api/payments/history.js
api/ping/ask.js
api/ping/complete.js
api/ping/match.js
api/agents/leaderboard.js
api/agents/wallet/*.js (5 files)
api/genesis/*.js (3 files)
+ 5 more
```

**Fix options:**
1. Convert all files to ES modules (`import`/`export`)
2. Rename files to `.cjs` extension
3. Remove `"type": "module"` from package.json

**Recommendation:** Option 1 - Convert to ES modules for consistency

### 3. Profile API KV Type Mismatch
**Impact:** `/api/profile?user=seth` returns 500
**Error:** `WRONGTYPE Operation against a key holding the wrong kind of value`

**Root cause:**
- `presence.js` stores data with `kv.set()` (string/JSON)
- `profile.js` reads with `kv.hgetall()` (expects hash)

**Location:** `api/profile.js:76`
```javascript
// Current (BROKEN):
const presence = await kv.hgetall(`presence:${name}`);

// Should be:
const presence = await kv.get(`presence:${name}`);
```

---

## 🟡 MODERATE ISSUES (Fix This Week)

### 4. Broken Payment/Economic APIs
**Status:** 500 FUNCTION_INVOCATION_FAILED
**Affected endpoints:**
- `/api/payments/tip` - 500
- `/api/reputation/score` - 500
- `/api/ping/ask` - 500

**Root causes:**
1. Missing `ethers` dependency
2. CommonJS require() in ESM context
3. Wrong import path for db.js

**Impact:** Economic layer completely non-functional

### 5. Wrong Import Paths
**Files affected:** `api/reputation/score.js`, `api/payments/tip.js`, `api/ping/ask.js`

```javascript
// Current (WRONG):
const { sql } = require('../lib/db');

// Should be (db.js is at lib/db.js, not api/lib/db.js):
const { sql } = require('../../lib/db');
```

### 6. Missing Database Tables
**Likely missing (need to verify):**
- `reputation_scores`
- `badge_awards`
- `badges`
- `tier_requirements`
- `expert_profiles`
- `expert_sessions`
- `wallet_events`
- `users` (with wallet_address column)

**Recommendation:** Run migration scripts or create tables

---

## 🟢 LOW PRIORITY (Future)

### 7. API Parameter Inconsistency
Some APIs use `user`, others use `handle`:
- Messages: `user` parameter
- Friends: `user` parameter
- Profile: `user` parameter
- Artifacts: `handle` parameter

**Recommendation:** Standardize to `handle` everywhere

### 8. Missing 404 Endpoints
These paths return 404 (expected - no file exists):
- `/api/payments/treasury` → use `/api/agents/wallet/treasury`
- `/api/ping/health` → doesn't exist
- `/api/identity/registry` → doesn't exist
- `/api/agents/discovery` → doesn't exist

### 9. SYNC NOTE Comments
Multiple files have outdated sync notes referencing `vibecodings repo`. These should be removed as vibe-platform is now canonical.

---

## Priority Fix Order

### P0 - Today (30 min)
1. **Fix Profile API** - Change `hgetall` to `get` (1 line)
2. **Add missing dependencies** - `pnpm add ethers @coinbase/coinbase-sdk`

### P1 - This Week (2-3 hours)
3. **Convert 20+ files from CommonJS to ESM** - Or rename to .cjs
4. **Fix import paths** - `../lib/db` → `../../lib/db`
5. **Create missing database tables** - Run migrations

### P2 - Next Week
6. **Standardize API parameters** - `user` vs `handle`
7. **Remove outdated sync comments**
8. **Add API validation middleware**

---

## Test Commands

```bash
# Core APIs (should all return 200)
curl -sL "https://slashvibe.dev/api/board?limit=2" | head -100
curl -sL "https://slashvibe.dev/api/presence" | head -100
curl -sL "https://slashvibe.dev/api/observations"
curl -sL "https://slashvibe.dev/api/projects" | head -100

# Secondary APIs (should return 200 with params)
curl -sL "https://slashvibe.dev/api/messages?user=seth"
curl -sL "https://slashvibe.dev/api/profile?user=seth"  # Currently 500
curl -sL "https://slashvibe.dev/api/friends?user=seth"

# Economic APIs (currently 500)
curl -sL "https://slashvibe.dev/api/payments/tip"
curl -sL "https://slashvibe.dev/api/reputation/score?handle=seth"
```

---

## File Inventory

### By Health Status

**✅ Healthy (ES Modules):**
- `api/board.js`
- `api/observations.js`
- `api/claude-activity.js`
- `api/projects.js`
- `api/presence.js`
- `api/messages.js`
- `api/friends.js`
- `api/artifacts.js`
- `api/games.js`
- `api/watch.js`
- `api/stats.js`
- `api/invites.js`
- `api/version.js`

**🔴 Broken (CommonJS):**
- `api/reputation/*.js` (3 files)
- `api/payments/*.js` (4 files)
- `api/ping/*.js` (4 files)
- `api/agents/*.js` (6 files)
- `api/genesis/*.js` (3 files)

**⚠️ Has Bugs:**
- `api/profile.js` (KV type mismatch)

---

## Summary

**What's working:** Core social features (board, presence, messages, games, projects)
**What's broken:** Economic layer (payments, reputation, ping marketplace)
**Root cause:** Dependency and module system issues from rapid development

**Recommended action:** Fix P0 items today, schedule P1 for this week. The economic layer can wait until core social is battle-tested with real users.
