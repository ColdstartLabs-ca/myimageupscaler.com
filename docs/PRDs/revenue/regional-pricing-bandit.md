# PRD: Regional Pricing Bandit (Auto-Optimize Discounts)

**Date:** 2026-04-08
**Status:** Draft

---

## Problem

Fixed regional discounts (40-65%) produce zero conversions in South Asia, SE Asia, and Africa. We're guessing prices. We need the system to figure out what works.

## Solution

Multi-armed bandit (Thompson Sampling) that tests different discount levels per region and auto-converges on the price that maximizes **revenue per visitor** (not just conversion rate).

## How It Works

1. Define 3-4 discount arms per region
2. On each `/api/geo` call, Thompson Sampling picks a discount
3. Client caches it for the session (already does this)
4. Checkout metadata includes `bandit_arm_id`
5. On payment webhook, update arm stats (conversions + revenue)
6. Over time, traffic shifts to the winning arm (~90%), keeps ~10% exploring

## Arms to Test

Based on Stripe data (Feb-Apr 2026): Standard works (78% of sales), LATAM/E.Europe convert weakly, South Asia/SE Asia/Africa = zero conversions despite 60-65% discounts.

| Region     | Current | Arms to Test       | Rationale                                      |
| ---------- | ------- | ------------------ | ---------------------------------------------- |
| Standard   | 0%      | No test            | Working fine                                   |
| LATAM      | 50%     | 35%, 45%, 55%, 65% | Has some conversions at 50%, explore around it |
| E. Europe  | 40%     | 25%, 35%, 45%, 55% | Has some at 40%, explore around it             |
| South Asia | 65%     | 50%, 65%, 75%, 80% | Zero conversions, needs wider exploration      |
| SE Asia    | 60%     | 45%, 60%, 70%, 80% | Zero conversions                               |
| Africa     | 65%     | 50%, 65%, 75%, 80% | Zero conversions                               |

## Margin Floor (Critical)

No arm can go below 40% gross margin. Floor calculation per product:

```
floor_price = (COGS + stripe_fixed_fee) / (1 - stripe_percent - min_margin)

COGS = credits * $0.008/credit  (conservative: 4x the $0.003 realistic average)
stripe_fixed = $0.30
stripe_percent = 2.9%
min_margin = 40%
```

**Calculated max discounts (40% margin floor):**

| Product     | Base Price | Credits | COGS   | Floor Price | Max Discount |
| ----------- | ---------- | ------- | ------ | ----------- | ------------ |
| Small Pack  | $4.99      | 50      | $0.40  | $1.23       | **75%**      |
| Medium Pack | $14.99     | 200     | $1.60  | $3.33       | **77%**      |
| Large Pack  | $39.99     | 600     | $4.80  | $8.93       | **77%**      |
| Starter     | $9.00      | 100     | $0.80  | $1.93       | **78%**      |
| Hobby       | $19.00     | 200     | $1.60  | $3.33       | **82%**      |
| Pro         | $49.00     | 1000    | $8.00  | $14.55      | **70%**      |
| Business    | $149.00    | 5000    | $40.00 | $70.65      | **52%**      |

All proposed test arms (max 80%) stay within floor for packs and lower subs. Business caps at 52% max discount.

## Optimize For

`revenue_per_impression = conversion_rate x price_charged`

NOT just conversion rate. A 90% discount converts more but makes less money.

Thompson Sampling formula:

- Sample conversion rate from Beta(conversions + 1, impressions - conversions + 1)
- Multiply by discounted price in cents
- Pick arm with highest expected revenue

## DB Schema

```sql
CREATE TABLE pricing_bandit_arms (
  id SERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  discount_percent INTEGER NOT NULL,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(region, discount_percent)
);
```

## Integration Points

1. **`/api/geo`** - Select arm via Thompson Sampling, return discount
2. **`/api/checkout`** - Pass `bandit_arm_id` in metadata
3. **Payment webhook** - Increment conversions + revenue for the arm
4. **`pricing-regions.ts`** - Falls back to fixed discount if bandit has no data

## Convergence

- ~50-100 impressions per arm before signal is meaningful
- With 5 regions x 4 arms = 20 arms to fill
- At current traffic, expect convergence in 2-4 weeks per region
- Standard region excluded (already converting well)

## Risks

- **Price discrimination optics**: Same product, different prices by country. Mitigated: this is standard PPP, competitors don't even offer it.
- **Low traffic regions**: May take months to converge in Africa. Acceptable - fixed discount is the fallback.
- **Stripe fee floor**: At very low prices ($1-2), Stripe's $0.30 fixed fee eats margin. The 40% floor calculation accounts for this.
