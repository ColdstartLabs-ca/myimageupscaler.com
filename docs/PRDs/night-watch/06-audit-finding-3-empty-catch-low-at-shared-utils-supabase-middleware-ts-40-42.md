# PRD: Audit Finding 3 - Empty Catch Block in Supabase Middleware

**Complexity: 1 → LOW mode**

- Touches 1-5 files
- Simple error handling improvement
- No new dependencies or complex state logic

---

## 1. Context

**Problem:** The `updateSession` function in `shared/utils/supabase/middleware.ts` has a catch block at lines 40-42 that logs errors to `console.error` but returns `{ user: null, supabaseResponse }` without any way for callers to distinguish between a genuine authentication failure (no user) and an unexpected error (Supabase connection failure, invalid configuration, etc.). This silent failure pattern makes debugging authentication issues difficult and could mask real problems.

**Files Analyzed:**

- `shared/utils/supabase/middleware.ts` — The `updateSession` function with the problematic catch block
- `lib/middleware/auth.ts` — Calls `updateSession` via `handlePageAuth` for page route authentication
- `middleware.ts` — Uses `handlePageAuth` for authentication on page routes
- `server/monitoring/logger.ts` — Baselime structured logger for proper error logging
- `tests/unit/middleware.unit.spec.ts` — Existing middleware test patterns

**Current Behavior:**

- The `updateSession` function creates a Supabase SSR client and calls `supabase.auth.getUser()`
- If an error occurs (network issue, invalid configuration, etc.), it's caught and logged with `console.error`
- The function returns `{ user: null, supabaseResponse }` — identical to the "no user authenticated" case
- Callers cannot distinguish between "user not logged in" and "something went wrong"
- Errors are only visible in server console logs, not tracked in monitoring systems

### Integration Points

**How will this feature be reached?**

- [x] Entry point: Every page request goes through `middleware.ts` → `handlePageAuth` → `updateSession`
- [x] Caller file: `lib/middleware/auth.ts` (line 235: `const { user, supabaseResponse } = await updateSession(req)`)
- [x] Registration/wiring: No new wiring required — this is an internal implementation improvement

**Is this user-facing?**

- [x] NO → Internal/background — this improves error handling and observability for authentication failures

**Full user flow:**

1. User visits any page on the site
2. Middleware invokes `updateSession` to refresh their Supabase session
3. If Supabase returns an error, it's logged with proper structured logging
4. User still gets `user: null` (graceful degradation)
5. Developers can now debug auth failures using Baselime logs instead of digging through console output

---

## 2. Solution

**Approach:**

- Replace `console.error` with structured logging via a simple edge-compatible logger
- Return the same `{ user: null, supabaseResponse }` for graceful degradation (users can still access public pages)
- Add a second catch block in `handlePageAuth` that logs to Baselime for production monitoring
- This provides two layers of logging: immediate console visibility during dev, and Baselime tracking in production
- No breaking changes — the function signature and return type remain identical

**Key Decisions:**

- **Not rethrowing errors**: Auth middleware failures should not block page access (graceful degradation)
- **Not changing the return type**: Adding an error field would require changes across all callers
- **Console.error remains**: Kept for local development debugging, structured logging is additive
- **Logging in handlePageAuth**: Better location for Baselime logging since it has access to the Request object for context

**Data Changes:** None

---

## 3. Execution Phases

### Phase 1: Add Structured Logging to `updateSession`

**Files (max 5):**

- `shared/utils/supabase/middleware.ts` — Add structured logging to the catch block

**Implementation:**

- [ ] Add an `error` property to the return type `IUpdateSessionResult` (optional, for internal tracking)
- [ ] Create an edge-compatible logging helper function that formats errors with context
- [ ] Update the catch block to use the new logging helper instead of `console.error`
- [ ] Ensure error objects are properly serialized (handle circular references, extract stack traces)

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/shared/utils/supabase/middleware.spec.ts` | `should log structured error when getUser throws` | Expects error log contains error message and stack trace |
| `tests/unit/shared/utils/supabase/middleware.spec.ts` | `should return null user on Supabase error` | Expects `{ user: null, supabaseResponse }` when error occurs |
| `tests/unit/shared/utils/supabase/middleware.spec.ts` | `should include error context in logs` | Expects log contains function name and error type |

**Verification Plan:**

1. **Unit Tests:** Run `yarn test tests/unit/shared/utils/supabase/middleware.spec.ts`
2. **User Verification:**
   - Action: Simulate a Supabase connection error (misconfigured env vars)
   - Expected: Error is logged with structured format, user can still access public pages
3. **Manual Test:** Check console output during development for improved error formatting

**Checkpoint:** Run `yarn verify` and related tests after this phase.

---

### Phase 2: Add Baselime Logging to `handlePageAuth`

**Files (max 5):**

- `lib/middleware/auth.ts` — Add Baselime logging in `handlePageAuth`
- `shared/utils/supabase/middleware.ts` — Export error information if available

**Implementation:**

- [ ] Import Baselime logger types (can't use runtime logger in shared code)
- [ ] Add a try-catch wrapper in `handlePageAuth` that catches errors from `updateSession`
- [ ] Log authentication failures to Baselime with request context (URL, user agent if available)
- [ ] Distinguish between expected failures (no session) and unexpected errors (Supabase down)

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/lib/middleware/auth.spec.ts` | `should log to Baselime on Supabase error` | Expects error is logged with request context |
| `tests/unit/lib/middleware/auth.spec.ts` | `should not log on normal auth failure (no user)` | Expects no Baselime log when user is simply not authenticated |

**Verification Plan:**

1. **Unit Tests:** Run `yarn test tests/unit/lib/middleware/auth.spec.ts`
2. **Integration:** Run `yarn test tests/unit/middleware.unit.spec.ts` to ensure middleware still works
3. **Production Check:** After deployment, verify auth errors appear in Baselime dashboard

**Checkpoint:** Run `yarn verify` after this phase.

---

## 4. Acceptance Criteria

- [ ] All phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] No breaking changes to `updateSession` function signature or return type
- [ ] Error logging provides actionable debugging information (error type, message, stack trace)
- [ ] Console output during development is more informative than generic "Error in updateSession"
- [ ] Baselime logs include request context for production debugging
- [ ] Graceful degradation is maintained — users can still access public pages when auth fails
