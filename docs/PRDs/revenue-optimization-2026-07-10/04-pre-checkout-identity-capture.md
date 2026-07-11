# PRD: Pre-Checkout Identity Capture

**Status:** Ready after email Slice 1  
**Complexity: 6 → MEDIUM mode** (+2 touches 6–10 files, +2 identity/state flow, +1 database change, +1 email integration)

## 1. Context

**Problem:** Anonymous users who express upgrade intent but leave before authentication have no recoverable identity.

**Reuse:** Extend `docs/PRDs/checkout-recovery-system.md` and the existing `revenue_recovery_intents` pipeline. Do not create a second abandoned-cart system.

## 2. Integration Points

- Guest clicks a purchase-intent CTA.
- Before checkout, a lightweight email/auth step captures and validates identity.
- Continuing users reach the same purchase picker/checkout selection they requested.
- Abandonment creates a consent-aware recovery intent only when allowed.

## 3. Solution

- Use the existing authentication mechanism (magic link/OTP as implemented) rather than collecting an unverified standalone marketing address.
- Preserve selected pack/plan, trigger, model, pricing region, and return path through authentication.
- Require marketing consent where legally/configurationally required; checkout/service messages must not be mislabeled transactional.
- Deduplicate identity and recovery intent when the guest signs into an existing account.
- Do not gate browsing or the free upscale flow—only the transition into payment already requiring auth.

## 4. Execution Phases

### Phase 1: Identity handoff — guest resumes the requested checkout after authentication

**Files (max 5):** purchase intent entry component/hook, existing auth modal/component, checkout tracking context, return handler, component/E2E test.

**Tests required:**

| Test                                                      | Assertion                                            |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `should request identity before guest checkout`           | Auth/email step opens with checkout intent preserved |
| `should resume selected small pack after authentication`  | Same selection and regional price reach checkout     |
| `should merge intent when email belongs to existing user` | No duplicate account/intent                          |

### Phase 2: Recovery eligibility — verified abandoners enter the existing lifecycle queue

**Files (max 5):** recovery intent service, existing migration or narrow additive migration, lifecycle eligibility service, service unit test, API test.

**Implementation:**

- [ ] Upsert intent only after verified identity.
- [ ] Cancel/suppress intent immediately on purchase.
- [ ] Record consent basis and source surface.
- [ ] Expire unused intent and minimize retained context.

**Verification plan:** Playwright: guest CTA → sign in → abandon → dry-run recovery eligibility; second flow completes purchase and proves suppression. Run affected tests and `yarn verify`.

## 5. Acceptance Criteria

- [ ] Guest checkout intent survives authentication without changing product or price.
- [ ] No unverified address receives a recovery email.
- [ ] Purchase cancels pending recovery idempotently.
- [ ] Existing authenticated checkout remains unchanged.
- [ ] Mobile and desktop flows have loading, cancel, and error coverage.
- [ ] Affected tests, `yarn test`, and `yarn verify` pass.
