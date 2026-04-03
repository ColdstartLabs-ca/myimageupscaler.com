# PRD: Fix Unsafe Type Assertion in subscription.config.ts

**Complexity: 2 → LOW mode**

- +1 Touches 2 files (`shared/config/env.ts`, `shared/config/subscription.config.ts`)
- +1 Minor code change (add field to schema, update import)

---

## 1. Context

**Problem:** Double type assertion (`as unknown as Type`) at line 318 in `shared/config/subscription.config.ts` bypasses TypeScript's type checking for environment variable access. This pattern indicates a missing type definition in the centralized env schema rather than a true type ambiguity, and disables type safety for the `SUBSCRIPTION_CONFIG_OVERRIDE` field.

**Files Analyzed:**

- `shared/config/subscription.config.ts` — Contains the unsafe assertion pattern in `getSubscriptionConfig()` function
- `shared/config/env.ts` — Centralized environment configuration with `serverEnvSchema` and Zod validation
- `logs/audit-report.md` — Source of the finding (Finding 5: unsafe_assertion)
- `tests/unit/config/subscription-config.unit.spec.ts` — Existing test patterns for subscription config

**Current Behavior:**

- Line 318 uses `(process.env as unknown as { SUBSCRIPTION_CONFIG_OVERRIDE?: string }).SUBSCRIPTION_CONFIG_OVERRIDE`
- The `as unknown as` pattern is required because the field isn't defined in any type
- Bypasses Zod validation that other environment variables receive
- Disables TypeScript's ability to catch typos or type mismatches
- Creates an inconsistent pattern compared to other env access in the codebase

### Integration Points

**How will this feature be reached?**

- [x] Entry point: Function call to `getSubscriptionConfig()` from subscription-related modules
- [x] Caller files: `server/stripe/config.ts`, subscription utils, webhook handlers
- [x] Registration/wiring: No registration changes - same function signature, safer implementation

**Is this user-facing?**

- [ ] YES → UI components required: N/A
- [x] NO → Internal refactor (function signature and behavior remain identical)

**Full user flow:**

1. Application starts → loads subscription configuration
2. Any code calls `getSubscriptionConfig()` to get plan/credit configuration
3. Function reads `SUBSCRIPTION_CONFIG_OVERRIDE` env var via typed `serverEnv` (after fix)
4. Returns merged or default configuration — **behavior unchanged**

---

## 2. Solution

**Approach:**

- Add `SUBSCRIPTION_CONFIG_OVERRIDE` as an optional string field to `serverEnvSchema` in `shared/config/env.ts`
- Add corresponding field to `loadServerEnv()` function to read from `process.env.SUBSCRIPTION_CONFIG_OVERRIDE`
- Update `getSubscriptionConfig()` to import `serverEnv` and use `serverEnv.SUBSCRIPTION_CONFIG_OVERRIDE`
- Remove the unsafe `as unknown as` type assertion pattern

**Key Decisions:**

- Use `serverEnv` (not `clientEnv`) since this is server-side configuration override
- Mark field as optional with `.optional()` in Zod schema — the override is for testing/development only
- No default value needed — undefined means no override
- Reuse existing env access pattern established in `shared/config/env.ts`

**Data Changes:** None — this is a code refactor only, no database changes

---

## 4. Execution Phases

### Phase 1: Add SUBSCRIPTION_CONFIG_OVERRIDE to serverEnv — Env var properly typed and validated

**Files (max 2):**

- `shared/config/env.ts` — Add field to schema and loader function
- `shared/config/subscription.config.ts` — Update to use serverEnv instead of direct process.env

**Implementation:**

- [ ] Add `SUBSCRIPTION_CONFIG_OVERRIDE: z.string().optional()` to `serverEnvSchema` in `shared/config/env.ts`
- [ ] Add `SUBSCRIPTION_CONFIG_OVERRIDE: process.env.SUBSCRIPTION_CONFIG_OVERRIDE` to `loadServerEnv()` function return object
- [ ] Add import `{ serverEnv }` to `shared/config/subscription.config.ts`
- [ ] Replace `(process.env as unknown as { SUBSCRIPTION_CONFIG_OVERRIDE?: string }).SUBSCRIPTION_CONFIG_OVERRIDE` with `serverEnv.SUBSCRIPTION_CONFIG_OVERRIDE`

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/config/subscription-config.unit.spec.ts` | `getSubscriptionConfig returns default config when no override` | `expect(config.version).toBe('1.0.0')` |
| `tests/unit/config/subscription-config.unit.spec.ts` | `getSubscriptionConfig merges override when provided` | `expect(mergedConfig.plans[0].creditsPerCycle).toBe(999)` |

**Verification Plan:**

1. **Unit Tests:** `yarn test tests/unit/config/subscription-config.unit.spec.ts`
2. **Type Check:** `yarn verify` confirms no TypeScript errors
3. **User Verification:**
   - Action: Run `yarn verify`
   - Expected: All tests pass, no TypeScript errors, no linting errors

**Checkpoint:** Run `yarn verify` after this phase.

---

## 5. Acceptance Criteria

- [ ] All phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] Feature is reachable (entry point connected, not orphaned code)
- [ ] No `as unknown as` type assertions for env access in `subscription.config.ts`
- [ ] `SUBSCRIPTION_CONFIG_OVERRIDE` properly typed via Zod schema in `serverEnvSchema`
- [ ] Existing behavior preserved (override still works when set)
- [ ] Follows project convention: env vars accessed via `serverEnv`, not `process.env` directly
