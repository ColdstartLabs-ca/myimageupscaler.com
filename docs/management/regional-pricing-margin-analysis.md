# Regional Dynamic Pricing — Profit Margin Analysis

**Date:** 2026-03-12
**Status:** Working document
**Data sources:** PRD (`docs/PRDs/regional-dynamic-pricing.md`), `shared/config/subscription.config.ts`, `shared/config/pricing-regions.ts`, `shared/config/credits.config.ts`

---

## 1. Summary

Regional pricing reduces per-subscriber revenue by 40–65% in target markets. At typical utilization rates (40–70% of monthly credits) and realistic API costs, **all subscription tiers remain profitable in all regions**. The only scenario where margin turns negative is the Business plan (Africa/South Asia, 65% discount) with >95% credit utilization AND API costs above $0.011/credit — an unlikely edge case requiring monitoring.

The primary business risk is not margin compression but **payment fraud**: discounted prices attract high-risk card attempts, as confirmed by the Egypt/Abu Dhabi Islamic Bank decline on 2026-03-12.

---

## 2. Pricing Structure

### 2.1 Standard Prices (USD/month)

| Plan | Price | Credits | $/credit |
|------|-------|---------|----------|
| Starter | $9.00 | 100 | $0.0900 |
| Hobby | $19.00 | 200 | $0.0950 |
| Pro | $49.00 | 1,000 | $0.0490 |
| Business | $149.00 | 5,000 | $0.0298 |

### 2.2 Regional Subscription Prices

| Plan | Standard | S. Asia (65% off) | SE Asia (60% off) | LatAm (50% off) | E. Europe (40% off) | Africa (65% off) |
|------|----------|-------------------|-------------------|-----------------|---------------------|------------------|
| Starter | $9.00 | **$3.15** | **$3.60** | **$4.50** | **$5.40** | **$3.15** |
| Hobby | $19.00 | **$6.65** | **$7.60** | **$9.50** | **$11.40** | **$6.65** |
| Pro | $49.00 | **$17.15** | **$19.60** | **$24.50** | **$29.40** | **$17.15** |
| Business | $149.00 | **$52.15** | **$59.60** | **$74.50** | **$89.40** | **$52.15** |

### 2.3 Credit Pack Regional Prices

| Pack | Credits | Standard | S. Asia | SE Asia | LatAm | E. Europe | Africa |
|------|---------|----------|---------|---------|-------|-----------|--------|
| Small | 50 | $4.99 | $1.75 | $2.00 | $2.50 | $2.99 | $1.75 |
| Medium | 200 | $14.99 | $5.25 | $6.00 | $7.50 | $8.99 | $5.25 |
| Large | 600 | $39.99 | $14.00 | $16.00 | $20.00 | $23.99 | $14.00 |

---

## 3. Revenue-per-Credit by Region

The effective $/credit measures how much revenue each consumed credit must cover in variable costs. This is the key margin lever since credits = compute consumed.

| Plan | Standard | S. Asia | SE Asia | LatAm | E. Europe | Africa |
|------|----------|---------|---------|-------|-----------|--------|
| Starter (100cr) | $0.0900 | $0.0315 | $0.0360 | $0.0450 | $0.0540 | $0.0315 |
| Hobby (200cr) | $0.0950 | $0.0333 | $0.0380 | $0.0475 | $0.0570 | $0.0333 |
| Pro (1000cr) | $0.0490 | $0.0172 | $0.0196 | $0.0245 | $0.0294 | $0.0172 |
| Business (5000cr) | $0.0298 | $0.0104 | $0.0119 | $0.0149 | $0.0179 | $0.0104 |

**Note:** The credit multiplier system is well-designed — expensive models (Clarity 4×, Flux-2-Pro 6×, nano-banana-pro 8×) cost proportionally more credits, so revenue-per-credit stays structurally consistent regardless of model mix. A Flux-2-Pro enhance (12 credits) generates 12× the revenue vs. a 1-credit upscale.

---

## 4. Gross Margin Analysis

### 4.1 API Cost Assumptions

> **Important caveat:** These are estimates. Actual Replicate API costs depend on exact model usage split. Calibrate with actual Replicate invoices.

| Scenario | $/credit consumed | Model mix assumption |
|----------|-------------------|----------------------|
| Optimistic | $0.003 | Mostly Real-ESRGAN (real-esrgan: ~$0.0023/pred) |
| Base case | $0.005 | Mixed (real-esrgan + gfpgan, occasional clarity) |
| Conservative | $0.010 | Heavy premium model use (clarity, flux-2-pro) |

Note: the credit multipliers already partially normalize cost per credit — a Flux-2-Pro prediction costs ~$0.05 on Replicate but uses 12 credits, so $0.0042/credit vs. real-esrgan at $0.003/credit. The range is narrower than raw model prices suggest.

### 4.2 Gross Profit at 50% Utilization (Typical SaaS)

At 50% utilization (users consume half their monthly credits):

**Base case ($0.005/credit):**

| Plan | Standard | S. Asia | SE Asia | LatAm | E. Europe | Africa |
|------|----------|---------|---------|-------|-----------|--------|
| Starter | $8.75 (97%) | $2.90 (92%) | $3.35 (93%) | $4.25 (94%) | $5.15 (95%) | $2.90 (92%) |
| Hobby | $18.50 (97%) | $6.15 (92%) | $7.10 (93%) | $9.00 (95%) | $10.90 (96%) | $6.15 (92%) |
| Pro | $46.50 (95%) | $14.65 (85%) | $17.10 (87%) | $22.00 (90%) | $26.90 (92%) | $14.65 (85%) |
| Business | $136.50 (92%) | $39.65 (76%) | $47.10 (79%) | $62.00 (83%) | $77.40 (87%) | $39.65 (76%) |

**All scenarios above are profitable at 50% utilization, across all regions and API cost assumptions.**

### 4.3 Break-Even Utilization Rate

The utilization rate at which a subscriber becomes unprofitable: `Revenue / (Credits × Cost_per_credit)`

**At $0.005/credit (base case):**

| Plan | S. Asia | SE Asia | LatAm | E. Europe |
|------|---------|---------|-------|-----------|
| Starter (100cr) | 630% | 720% | 900% | 1080% |
| Hobby (200cr) | 665% | 760% | 950% | 1140% |
| Pro (1000cr) | 343% | 392% | 490% | 588% |
| Business (5000cr) | 208% | 238% | 298% | 357% |

→ At $0.005/credit, it is **physically impossible** to exhaust the plan before break-even (>100% utilization required).

**At $0.010/credit (conservative):**

| Plan | S. Asia | SE Asia | LatAm | E. Europe |
|------|---------|---------|-------|-----------|
| Starter (100cr) | 315% | 360% | 450% | 540% |
| Hobby (200cr) | 333% | 380% | 475% | 570% |
| Pro (1000cr) | 172% | 196% | 245% | 294% |
| Business (5000cr) | **104%** | 119% | 149% | 179% |

→ Business S.Asia/Africa becomes unprofitable only above **104% utilization at $0.010/credit** — which isn't possible. Still safe.

**At $0.012/credit (worst case):**

| Plan | S. Asia break-even |
|------|-------------------|
| Starter | 263% — safe |
| Hobby | 277% — safe |
| Pro | 143% — safe |
| Business | **87%** — at risk above 87% utilization |

**The only vulnerable scenario:** Business plan in Africa or South Asia (65% discount) where a power user consistently uses >87% of 5,000 credits and the API mix skews heavily to premium models.

---

## 5. Break-Even Conversion Multiplier

How many more regional subscribers are needed to equal the revenue of 1 standard subscriber?

| Region | Discount | Multiplier | Example: need X South Asia Starters to equal 1 US Starter |
|--------|----------|------------|-------------------------------------------------------------|
| S. Asia | 65% | **2.86×** | 3 Indian Starter subscribers = 1 US Starter in revenue |
| SE Asia | 60% | **2.50×** | 2.5 Philippine subscribers = 1 US |
| LatAm | 50% | **2.00×** | 2 Brazilian subscribers = 1 US |
| E. Europe | 40% | **1.67×** | 1.67 Ukrainian subscribers = 1 US |
| Africa | 65% | **2.86×** | 3 Nigerian subscribers = 1 US |

**The core bet:** these markets have enough latent demand that the conversion rate uplift exceeds the multiplier. If India, for example, has 10× the potential subscriber pool at $3.15 vs. near-zero at $9, the pricing unlocks 3.5× more revenue than leaving them at standard price (10 ÷ 2.86 = 3.5×).

---

## 6. Total Revenue Impact (Scenario Modeling)

Assuming current subscriber distribution is 100% standard, and regional pricing brings the following **net-new** subscribers (not cannibalizing standard):

**Conservative scenario (1 new regional subscriber per 10 existing standard):**

If you have 100 Starter standard subscribers ($900/mo), and regional pricing adds:
- 3 S. Asia: $9.45/mo
- 5 SE Asia: $18.00/mo
- 5 LatAm: $22.50/mo
- 2 E. Europe: $10.80/mo
- 2 Africa: $6.30/mo

**+$67.05/mo (+7.4%)** from 17 new subscribers who would have converted at $0 otherwise.

**Optimistic scenario (1 new regional per 3 standard):**

33 new subscribers → **+$221/mo (+24.6%)** on top of existing standard revenue.

---

## 7. Credit Pack Margin Profile

Credit packs are one-time purchases with tighter margin windows since there's no rollover to amortize API costs.

| Pack | S. Asia price | API cost at 100% use (base) | Gross profit | Margin |
|------|---------------|------------------------------|--------------|--------|
| Small (50cr) | $1.75 | $0.25 | $1.50 | 85.7% |
| Medium (200cr) | $5.25 | $1.00 | $4.25 | 80.9% |
| Large (600cr) | $14.00 | $3.00 | $11.00 | 78.6% |

Credit packs have healthy margins even at 100% usage (since users buy them when they intend to use them) and at the $0.005/credit base case. The risk here is overstated — packs are consumed, not hoarded.

---

## 8. Risk Factors

### 8.1 Payment Fraud (HIGH — active)

**Evidence:** 2026-03-12 — Egypt user (ABU DHABI ISLAMIC BANK card, EG billing, name/email mismatch) attempted $5.25 Medium Pack (Africa region, 65% off). Blocked by Stripe network fraud protection.

**Pattern:** Discounted prices attract high-risk card attempts from the same regions they target. This is expected and Stripe's built-in protection caught it correctly. No credits were added.

**Impact:**
- No direct financial loss (payment was blocked before completion)
- Potential support overhead from legitimate customers whose cards are also flagged
- Stripe's blocking rate for these regions may be 5–20% of attempts

**Mitigation already in place:** Stripe network protection (no Radar config needed), `checkout.session.completed` only fires on success, webhook idempotency guard.

**Recommendation:** Monitor chargeback rate (not just decline rate) per region. Target: <1% chargeback rate. Consider enabling Stripe Radar rules for threshold limits (e.g., block cards from specific high-fraud BINs if chargeback rate climbs).

### 8.2 VPN Arbitrage (LOW)

A US/EU user connecting via VPN from India gets South Asia pricing. Implementation uses `CF-IPCountry` (Cloudflare-set, not client-spoofable). VPN users get their VPN exit node's country — acceptable tradeoff per PRD. Economically, this affects at most the difference between $9 and $3.15 per subscriber; at current scale, negligible.

### 8.3 Business Plan Margin Compression (LOW — monitor)

As shown in Section 4.3: Business South Asia/Africa could go negative if API cost/credit exceeds ~$0.012 AND utilization exceeds 87%. This is unlikely at current scale but warrants:
- Tracking average credits consumed per Business plan subscriber by region
- Comparing against actual Replicate invoice cost per billing cycle

### 8.4 Revenue Recognition for Regional Prices (INFO)

Since regional subscriptions use Stripe `price_data` (inline pricing), Stripe auto-generates throwaway Price IDs. The webhook handler correctly resolves back to the base plan via `plan_key` metadata (`getBasePriceIdByPlanKey`). Verified in `payment.handler.ts` lines 167–169. No revenue misattribution risk.

---

## 9. Unknowns (Data Needed to Refine This Analysis)

| Unknown | Impact on analysis | How to get it |
|---------|-------------------|---------------|
| Actual $/credit API cost | Margin calculations use estimates | Pull Replicate monthly invoice, divide by total predictions |
| Credit utilization rate per region | Break-even calculations assume 50–90% | Query `credit_transactions` grouped by user country |
| Conversion rate uplift by region | Core PPP bet | Amplitude: checkout_started by pricingRegion after launch |
| Chargeback rate by region | Fraud risk | Stripe Dashboard → Disputes, filter by billing country |

---

## 10. Recommendations

| Priority | Action |
|----------|--------|
| **P1** | After 30 days post-launch, pull Amplitude `checkout_completed` filtered by `pricingRegion` to validate conversion uplift hypothesis |
| **P1** | Compare actual Replicate invoice total ÷ credit_transactions count to calibrate $/credit assumption |
| **P2** | Set up Stripe Radar rule: flag (not block) disputes from Africa/South Asia regions to track chargeback rate |
| **P2** | Add a Supabase query to weekly metrics: avg credits consumed by region × plan, to catch Business plan power users in high-discount regions |
| **P3** | If chargeback rate from any region exceeds 2%, consider re-evaluating Business plan availability in that region or requiring 3D Secure |
| **P3** | Phase-in approach: start with South Asia + Southeast Asia (highest PPP need, relatively lower fraud risk vs. West Africa) before enabling Africa region for Business plan |

---

## Appendix: Region Definitions (from `pricing-regions.ts`)

| Region | Key Countries |
|--------|---------------|
| Standard (0%) | US, CA, GB, DE, FR, JP, AU, NL, CH, SE, NO, DK... |
| South Asia (65%) | IN, PK, BD, LK, NP, AF, BT |
| Southeast Asia (60%) | PH, ID, VN, TH, MM, KH, LA, MY, TL |
| LatAm (50%) | BR, MX, CO, AR, PE, CL, EC + 16 more |
| Eastern Europe (40%) | UA, RO, BG, RS + Balkans, Central Asia, TR, CN, IR |
| Africa (65%) | All 54 African nations including EG, NG, ZA, KE |

Total discounted countries: ~110 countries covering ~4.5B people.
