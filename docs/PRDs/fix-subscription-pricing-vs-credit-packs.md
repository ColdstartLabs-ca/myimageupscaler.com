# Fix Subscription Pricing vs Credit Packs

**Complexity: 4 → MEDIUM mode**
**Date:** 2026-05-11
**Status:** Ready

---

## 1. Context

**Problem:** Subscription pricing offers no meaningful per-credit savings compared to one-time credit packs, and in one case is actively more expensive. This undermines the entire subscription value proposition.

**Current Economics:**

| Product | Credits | Price | $/credit | vs Subscription |
|---------|---------|-------|----------|-----------------|
| Small Pack | 50 | $4.99 | $0.10 | — |
| Medium Pack | 200 | $14.99 | $0.075 | — |
| Large Pack | 600 | $39.99 | $0.067 | — |
| **Starter Sub** | 100 | **$9.00** | **$0.09** | 10% cheaper than 2× small |
| **Hobby Sub** | 200 | **$19.00** | **$0.095** | **27% MORE expensive than medium pack** |
| Pro Sub | 1000 | $49.00 | $0.049 | 30% cheaper than one-time equiv |
| Business Sub | 5000 | $149.00 | $0.030 | 55% cheaper than one-time equiv |

**Why this matters:**
- Starter saves only $0.98/month vs buying credits one-time — not enough to justify a recurring commitment.
- Hobby is **$4.01 more expensive** than just buying the medium pack. A rational user will never subscribe.
- Pro and Business are fine, but the bottom of the funnel (Starter → Hobby) is broken.

**Files Analyzed:**

- `shared/config/subscription.config.ts` — subscription and credit pack price display values
- `shared/config/credits.config.ts` — credit pack sizes and subscription credit allocations
- `scripts/setup-stripe.ts` — Stripe product creation script (must match config)
- `app/api/checkout/route.ts` — checkout uses Stripe Price IDs directly (not config amounts)
- Multiple test files with hardcoded price assertions

## 2. Solution

**Approach:** Update `priceInCents` in config and setup script. Update all tests. Rely on manual Stripe Price object update (or re-run setup script) to sync actual charge amounts.

**New Pricing:**

| Plan | Credits | Old Price | New Price | $/credit | vs One-Time Savings |
|------|---------|-----------|-----------|----------|---------------------|
| Starter | 100 | $9.00 | **$5.99** | $0.06 | 40% vs 2× small |
| Hobby | 200 | $19.00 | **$9.99** | $0.05 | 33% vs medium pack |
| Pro | 1000 | $49.00 | **$34.99** | $0.035 | 42% vs one-time equiv |
| Business | 5000 | $149.00 | **$99.99** | $0.02 | 71% vs one-time equiv |

Credit packs remain unchanged.

**Key Decisions:**

- **Do not change checkout flow** — keep using Stripe Price IDs. Lower risk; Stripe Price objects just need updating.
- **Config is display-only source of truth** — actual checkout amounts come from Stripe. Both must match.
- **Aggressive but rational discounts on lower tiers** — Starter and Hobby must be no-brainers to drive subscription adoption.

**Post-Deploy Critical Step:**

After merging, either:
1. Update existing Stripe Price objects in Stripe Dashboard to match new config amounts, OR
2. Archive old prices and re-run `scripts/setup-stripe.ts` to create new Price objects, then update env vars.

If Stripe prices are not updated, the UI will show $5.99 but Stripe will charge $9.00.

## 3. Files to Modify

### Config & Setup
- `shared/config/subscription.config.ts` — update `priceInCents` for all 4 plans
- `scripts/setup-stripe.ts` — update `priceInCents` in `SUBSCRIPTION_PRODUCTS`

### Tests (hardcoded price assertions)
- `tests/unit/config/subscription-config.unit.spec.ts`
- `tests/unit/subscription-config.unit.spec.ts`
- `tests/unit/subscription-resolver.unit.spec.ts`
- `tests/unit/subscription-utils.unit.spec.ts`
- `tests/unit/api/checkout-region-tracking.unit.spec.ts`
- `tests/unit/pricing/pricing-regions.unit.spec.ts`
- `tests/unit/pricing/checkout-regional.unit.spec.ts`
- `tests/unit/pricing/pricing-display.unit.spec.ts`
- `tests/unit/api/subscription-price-resolution-fallbacks.unit.spec.ts`
- `tests/unit/api/stripe-webhooks.unit.spec.ts`
- `tests/unit/webhooks/subscription-cancel-tier-reset.unit.spec.ts`
- `tests/unit/bugfixes/downgrade-flow-bugs.unit.spec.ts`
- `tests/unit/bugfixes/billing-credit-renewal.unit.spec.ts`
- `tests/unit/api/stripe-webhooks-idempotency.unit.spec.ts`

### Docs (out-of-date pricing references)
- `docs/management/regional-pricing-margin-analysis.md`
- `docs/PRDs/regional-dynamic-pricing.md`
- `docs/PRDs/regional-pricing-bandit.md`
- `docs/audits/pricing-strategy-economics-audit.md`
- `docs/business-model-canvas/04-revenue-costs.md`
- `docs/business-model-canvas/economics/pricing-proposal-v2.md`
- `docs/business-model-canvas/economics/image-upscaling-models.md`
- `docs/audits/free-paid-plan-audit-12-18-25.md`

## 4. Acceptance Criteria

- [ ] `shared/config/subscription.config.ts` reflects new prices ($5.99 / $9.99 / $34.99 / $99.99)
- [ ] `scripts/setup-stripe.ts` reflects new prices
- [ ] All unit tests pass after updating hardcoded price assertions
- [ ] All integration tests pass
- [ ] Docs referencing old prices are updated
- [ ] Stripe Price objects are updated in Stripe Dashboard (or new ones created via setup script)
- [ ] Pricing page displays correct new prices
- [ ] Checkout charges the correct new amounts

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stripe Price objects not updated → price mismatch | High | High | Add post-deploy checklist item; verify checkout end-to-end after deploy |
| Regional pricing calculations break (tests use old base prices) | Medium | Medium | Update all test assertions that reference 900/1900/4900/14900 |
| Engagement discount math drifts (based on medium pack $14.99) | Low | Low | Medium pack price unchanged; no action needed |
