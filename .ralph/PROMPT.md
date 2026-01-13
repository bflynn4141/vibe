# /vibe Ralph Loop - Continuous Improvement

You are iteratively improving the vibe-platform codebase. Each iteration:

1. Check what's already been done (git log, existing files)
2. Pick the next item from the current phase checklist
3. Make ONE focused improvement
4. Verify with health check: `curl https://www.slashvibe.dev/api/health?full=true`
5. If healthy, commit with prefix: `[ralph] <description>`
6. If all phase items complete, output: `<promise>PHASE COMPLETE</promise>`

## Current Phase: Test Coverage

Add Vitest test infrastructure and write tests for core API endpoints.

### Checklist

- [x] Add Vitest config (vitest.config.js)
- [x] Create test helper for mocking KV (`tests/helpers/kv-mock.js`)
- [x] Test: `/api/health` returns healthy structure (4 tests)
- [x] Test: `/api/presence` GET returns active array
- [x] Test: `/api/board` GET returns entries array
- [x] Test: `/api/growth/leaderboard` returns leaderboard
- [x] Test: `/api/analytics/summary` returns metrics
- [ ] Test: `/api/messages` GET returns inbox structure
- [ ] Test: `/api/invites` create returns valid code
- [ ] Test: `/api/skills/:handle` returns auto-generated profile
- [ ] Test: `/api/gigs` CRUD operations

### Rules

- ONE improvement per iteration (small, focused commits)
- NEVER break health check (verify before committing)
- Run `npm test` to verify tests pass before committing
- Skip tests that require actual KV data - mock everything
- Each test file should be self-contained

### Technical Context

- Platform: Vercel serverless functions (ES modules)
- Storage: Vercel KV (Redis), Vercel Postgres
- Test runner: Vitest (not Jest - we need ESM support)
- All API handlers export: `export default async function handler(req, res)`

### Verification

```bash
# Before each commit
curl -s https://www.slashvibe.dev/api/health | jq '.status'
npm test
git status --porcelain
```

When all tests are passing and checklist complete, output:
```
<promise>TESTS COMPLETE</promise>
```
