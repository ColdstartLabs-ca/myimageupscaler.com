# PRD: Fix Locale-Prefixed Dashboard Redirect Loop

**Complexity: 3 → LOW mode**

- Touches 2 files
- Logic fix in existing module

---

## 1. Context

**Problem:** Accessing `/pt/dashboard` (or other locale-prefixed dashboard routes) can cause `TOO_MANY_REDIRECTS` error due to multiple interacting issues in the middleware.

**Files Analyzed:**

- `middleware.ts` - Main middleware with locale routing and auth handling
- `lib/middleware/auth.ts` - Auth helpers
- `app/[locale]/dashboard/layout.tsx` - Client-side dashboard layout with auth redirect
- `i18n/config.ts` - Locale configuration

**Current Behavior:**

1. `handleLocaleRouting()` returns `NextResponse.next()` early for valid locale-prefixed paths (line 289)
2. This causes `handlePageRoute()` to never be called for paths like `/pt/dashboard`
3. The auth redirect check `pathname.startsWith('/dashboard')` (line 460) doesn't match `/pt/dashboard`
4. `login` and `next` are in `TRACKING_QUERY_PARAMS`, so they get stripped when auth redirects happen
5. Client-side dashboard layout redirects to `/` without preserving locale or query params

---

## 2. Solution

**Approach:**

1. Remove `login` and `next` from `TRACKING_QUERY_PARAMS` - these are functional, not tracking params
2. Refactor middleware to apply page auth checks even when locale routing handles the request
3. Make dashboard path detection locale-aware to match `/{locale}/dashboard` patterns

**Key Decisions:**

- [x] Keep locale routing returning early for non-dashboard routes (performance)
- [x] Add special handling for dashboard routes within locale routing
- [x] Preserve `login` and `next` params - they're needed for auth flow

**Data Changes:** None

---

## 3. Execution Phases

### Phase 1: Remove `login` and `next` from tracking params

**Files (1):**

- `middleware.ts` - Remove `login` and `next` from `TRACKING_QUERY_PARAMS`

**Implementation:**

- [ ] Remove `'signup'`, `'login'`, and `'next'` from `TRACKING_QUERY_PARAMS` array (lines 23-25)

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/middleware/tracking-params.unit.spec.ts` | `should preserve login and next query params` | `expect(response.status).not.toBe(301)` when URL has `?login=1&next=/dashboard` |

**User Verification:**

- Action: Visit `/?login=1&next=/dashboard`
- Expected: Page loads without redirect, params preserved in URL

---

### Phase 2: Make dashboard auth check locale-aware

**Files (1):**

- `middleware.ts` - Fix `handlePageRoute` and integrate with locale routing

**Implementation:**

- [ ] Create helper function `isDashboardPath(pathname: string): boolean` that checks for `/dashboard` or `/{locale}/dashboard`
- [ ] Update `handlePageRoute` to use locale-aware dashboard detection
- [ ] Modify `handleLocaleRouting` to NOT return early for dashboard paths - let them fall through to `handlePageRoute`

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/middleware/locale-dashboard.unit.spec.ts` | `should redirect unauthenticated user from /pt/dashboard to login` | `expect(response.status).toBe(307)` and redirect URL contains `login=1` |
| `tests/unit/middleware/locale-dashboard.unit.spec.ts` | `should allow authenticated user to access /pt/dashboard` | `expect(response.status).toBe(200)` |
| `tests/unit/middleware/locale-dashboard.unit.spec.ts` | `should preserve locale in dashboard auth redirect` | Redirect URL should be `/${locale}?login=1&next=/${locale}/dashboard` |

**User Verification:**

- Action: Clear cookies, visit `/pt/dashboard`
- Expected: Redirect to `/pt?login=1&next=/pt/dashboard` (or equivalent auth flow), no TOO_MANY_REDIRECTS

---

## 4. Acceptance Criteria

- [ ] Phase 1 complete - `login` and `next` params not stripped
- [ ] Phase 2 complete - locale-prefixed dashboard routes properly protected
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] No redirect loop when accessing `/pt/dashboard` unauthenticated
- [ ] Authenticated users can access `/pt/dashboard` normally
