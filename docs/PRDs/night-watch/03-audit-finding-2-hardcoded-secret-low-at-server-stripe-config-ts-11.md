# PRD: Audit Finding 2: Hardcoded Secret in Stripe Config

**Complexity: 1 → LOW mode**

- +1 Touches 1 file (server/stripe/config.ts)

---

## 1. Context

**Problem:** A hardcoded dummy Stripe key (`sk_test_dummy_key_for_build`) is used as a fallback when `STRIPE_SECRET_KEY` is not set. While this is intended to allow builds to succeed without credentials, using a dummy fallback in production could mask configuration errors. The secure approach is to fail explicitly in production rather than silently proceeding with an invalid key.

**Files Analyzed:**

- `server/stripe/config.ts` — Stripe client initialization with hardcoded dummy fallback
- `shared/config/env.ts` — Environment configuration with `isProduction()` helper and `serverEnv` schema
- `logs/audit-report.md` — Original audit finding source
- `vitest.config.ts` — Test configuration for understanding test patterns
- `vitest.setup.tsx` — Test setup with environment variable mocks

**Current Behavior:**

- `server/stripe/config.ts:11` initializes Stripe with `serverEnv.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build'`
- A console warning is logged if `STRIPE_SECRET_KEY` is not set, but the code continues with the dummy key
- The webhook secret validation (lines 22-26) already demonstrates the pattern of warning in production — this should be extended to the secret key
- The `isProduction()` helper is already imported from `@shared/config/env`

### Integration Points

**How will this feature be reached?**

- [x] Entry point: Server startup / build process
- [x] Caller file: Any code that imports from `server/stripe/config.ts`
- [x] Registration/wiring: Already wired — Stripe client is exported and used throughout the server

**Is this user-facing?**

- [ ] YES → UI components required
- [x] NO → Internal/background (this is a build-time/startup validation)

**Full user flow:**

1. Developer deploys to production without setting `STRIPE_SECRET_KEY`
2. Build starts, `server/stripe/config.ts` is evaluated
3. **New behavior:** Code throws an explicit error: "STRIPE_SECRET_KEY is required in production"
4. Deployment fails immediately with clear error message (not silent failure later)

---

## 2. Solution

**Approach:**

- Remove the hardcoded dummy key fallback
- Add explicit production check that throws an error if `STRIPE_SECRET_KEY` is missing
- Allow empty/missing key in development and test environments (for local builds and CI)
- Create a dedicated test file for this configuration validation

**Key Decisions:**

- Use the existing `isProduction()` helper from `@shared/config/env`
- Throw `Error` with descriptive message for immediate visibility
- Development/test environments should still warn but not throw (allows building without credentials)
- Follow existing pattern from webhook secret validation (lines 22-26)

**Data Changes:** None

---

## 4. Execution Phases

### Phase 1: Remove Hardcoded Secret and Add Production Validation

**Files (max 5):**

- `server/stripe/config.ts` — Remove dummy fallback, add production validation

**Implementation:**

- [ ] Remove `|| 'sk_test_dummy_key_for_build'` fallback from Stripe initialization
- [ ] Add conditional check: if `isProduction()` and no `STRIPE_SECRET_KEY`, throw error
- [ ] Update warning message to be clearer about environment-specific behavior

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `server/stripe/__tests__/config.test.ts` | `should throw error in production when STRIPE_SECRET_KEY is missing` | `expect(() => ...).toThrow('STRIPE_SECRET_KEY is required in production')` |
| `server/stripe/__tests__/config.test.ts` | `should not throw error in development when STRIPE_SECRET_KEY is missing` | `expect(() => ...).not.toThrow()` |
| `server/stripe/__tests__/config.test.ts` | `should warn when STRIPE_SECRET_KEY is missing` | `expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('STRIPE_SECRET_KEY'))` |

**Verification Plan:**

1. **Unit Tests:** Run `yarn test server/stripe/__tests__/config.test.ts`
2. **User Verification:**
   - Action: Run `yarn build` locally without `STRIPE_SECRET_KEY`
   - Expected: Build succeeds with warning (development mode)
   - Action: Run `ENV=production yarn build` without `STRIPE_SECRET_KEY`
   - Expected: Build fails with error "STRIPE_SECRET_KEY is required in production"

**Checkpoint:** Run `yarn verify` after this phase.

---

## 5. Acceptance Criteria

- [ ] All phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] No hardcoded secrets in `server/stripe/config.ts`
- [ ] Production builds fail explicitly when `STRIPE_SECRET_KEY` is missing
- [ ] Development/test builds continue to work without `STRIPE_SECRET_KEY` (with warning)
- [ ] Code follows existing pattern from webhook secret validation
