# PRD: February–June Conversion Collapse Diagnostic

**Status:** Ready  
**Complexity: 5 → MEDIUM mode** (+2 touches 6–10 files, +2 cross-system analytics logic, +1 analytics API integration)

## 1. Context

**Problem:** Signup volume grew 3.5× while pack-buyer conversion fell from 4.8% to about 1.1%; the business cannot choose the right funnel fix until mix shift is separated from product regression.

**Files analyzed:** the source report, `shared/analytics`, `app/api/analytics/event/route.ts`, checkout tracking hooks, pricing-region utilities, and the existing click-to-checkout/revenue-funnel PRDs.

**Non-goal:** This slice diagnoses and instruments. It does not redesign checkout or change prices.

## 2. Integration Points

- Entry points are signup, activation/first success, upgrade prompt, checkout creation, and Stripe purchase confirmation.
- Client/server events share a versioned funnel contract and stable anonymous/user/session identifiers.
- A repeatable analysis script/query produces a cohort table; it does not run in a Cloudflare request path.

## 3. Solution

- Define monthly signup cohorts and measure activation, upgrade click, checkout open, and first paid purchase within fixed 7- and 30-day windows.
- Segment by first-touch source/medium, landing page family, region/pricing tier, device, auth state, and pSEO vs non-pSEO.
- Add missing event properties only; do not create parallel analytics event names.
- Use decomposition: hold February segment conversion rates against June mix to estimate traffic dilution, then compare within-segment rates to find product regression.
- Produce an evidence table and select phases from existing repair PRDs based on the largest absolute lost-buyer contribution.

## 4. Execution Phases

### Phase 1: Funnel contract completeness — each paid purchase joins back to acquisition and checkout

**Files (max 5):** analytics event types, analytics API route, checkout tracking context, checkout API, associated unit tests.

**Tests required:**

| Test                                                                   | Assertion                              |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `should preserve acquisition and landing-page fields through checkout` | Required dimensions reach server event |
| `should reject invalid funnel schema version`                          | Bad payload returns validation error   |
| `should attach authenticated user id server-side`                      | Client cannot spoof identity           |

### Phase 2: Cohort decomposition — report identifies the largest source of lost buyers

**Files (max 5):** one existing analytics script location, its unit test, and optional query fixture files.

**Implementation:**

- [ ] Use fixed maturity windows to avoid comparing full February with partial July.
- [ ] Exclude internal/test/refunded purchases and document identity join coverage.
- [ ] Output counts and rates, never only percentages; suppress tiny segments below a documented threshold.
- [ ] Rank segments by absolute expected-minus-actual buyers.

**Verification plan:** Validate the script against synthetic cohorts with known mix-shift and regression cases; cross-check total purchases against Stripe for one month; run `yarn verify`.

## 5. Acceptance Criteria

- [ ] ≥90% of confirmed purchases join to a signup cohort or are explicitly classified as unmatched.
- [ ] February through June use identical 7-day and 30-day conversion definitions.
- [ ] The result quantifies traffic mix effect vs within-segment conversion effect.
- [ ] Top three lost-buyer segments each map to a specific existing PRD phase or a documented no-action conclusion.
- [ ] No heavy analysis runs inside the Cloudflare Worker request budget.
- [ ] Affected tests, `yarn test`, and `yarn verify` pass.
