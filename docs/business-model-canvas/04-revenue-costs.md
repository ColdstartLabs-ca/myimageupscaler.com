# Revenue Streams & Cost Structure

## Revenue Model: Credit-Based Subscription

### Why Credit-Based Subscriptions?

- **Industry standard:** Let's Enhance, VanceAI use this model
- **Flexibility:** Credits roll over on personal tiers (3-6x cap), reducing churn
- **Business tier:** No rollover (like Let's Enhance) - forces usage, reduces liability
- **Predictable revenue:** Monthly/annual recurring
- **Upsell opportunities:** Run out of credits → upgrade trigger

---

## Pricing Tiers

### Consumer/Pro Tiers

| Plan         | Price  | Credits       | $/Credit | Gross Margin |
| ------------ | ------ | ------------- | -------- | ------------ |
| **Free**     | $0     | 10 (one-time) | -        | -            |
| **Starter**  | $9/mo  | 100           | $0.09    | 98.1%        |
| **Pro**      | $29/mo | 500           | $0.058   | 97.1%        |
| **Business** | $99/mo | 2,500         | $0.04    | 95.7%        |

### Annual Pricing (17% discount)

| Plan     | Monthly | Annual  | Savings |
| -------- | ------- | ------- | ------- |
| Starter  | $9/mo   | $90/yr  | $18     |
| Pro      | $29/mo  | $290/yr | $58     |
| Business | $99/mo  | $990/yr | $198    |

---

## Tier Details

### FREE TIER (Acquisition Funnel)

**Price:** $0
**Credits:** 10 (one-time signup bonus)

**Features:**

- 2x/4x upscaling
- Basic enhancement only
- Standard processing (T4 GPU)
- **No watermarks** (differentiation!)
- 7-day image storage

**Cost Per User:**

- 10 images × $0.0017 = $0.017
- Infrastructure share: $0.01/month
- **Total Cost:** ~$0.03/user

**Strategic Purpose:**

- Product-led growth engine
- SEO benefit (user content)
- Word-of-mouth marketing
- Target: 10,000+ free users

---

### STARTER TIER ($9/month)

**Credits:** 100/month

**Features:**

- All upscaling modes (2x/4x)
- All enhancement modes + text preservation
- Batch upload (5 images)
- Credits roll over (up to 3x monthly = 300)
- Platform presets (Shopify, Amazon, Instagram)
- 30-day image storage
- Email support

**Cost Analysis:**

```
Revenue: $9.00
AI Processing (100 × $0.0017): $0.17
Infrastructure: $0.05/month
Support overhead: $0.20/month
Total Cost: $0.42
Gross Profit: $8.58
Margin: 95.3%
```

**Target Customer:** Small e-commerce sellers, casual content creators

**LTV Calculation:**

- ARPU: $9/month
- Average lifetime: 12 months
- **LTV:** $108

---

### PRO TIER ($29/month)

**Credits:** 500/month

**Features:**

- Everything in Starter
- Priority processing (A100 available)
- Batch upload (50 images)
- API access (5,000 calls/month)
- Shopify/WooCommerce integration
- 90-day image storage
- Priority email support

**Cost Analysis:**

```
Revenue: $29.00
AI Processing (500 × $0.0017): $0.85
Infrastructure: $0.15/month
Support overhead: $0.50/month
Total Cost: $1.50
Gross Profit: $27.50
Margin: 94.8%
```

**Target Customer:** Growing e-commerce, professional content creators

**LTV Calculation:**

- ARPU: $29/month
- Average lifetime: 18 months
- **LTV:** $522

---

### BUSINESS TIER ($99/month)

**Credits:** 2,500/month

**Features:**

- Everything in Pro
- Fastest processing (dedicated A100)
- Batch upload (500 images)
- **No credit rollover** (use monthly allocation - like Let's Enhance business plans)
- API access (25,000 calls/month)
- Team accounts (up to 5 users)
- Unlimited image storage
- Priority phone + chat support
- White-label option
- Custom enhancement profiles

**Cost Analysis:**

```
Revenue: $99.00
AI Processing (2,500 × $0.0026 for A100): $6.50
Infrastructure: $1.00/month
Support overhead: $2.00/month
Total Cost: $9.50
Gross Profit: $89.50
Margin: 90.4%
```

**Target Customer:** Large e-commerce, agencies, photography studios

**LTV Calculation:**

- ARPU: $99/month
- Average lifetime: 24 months
- **LTV:** $2,376

---

## API Pricing

| Tier           | Price   | Calls/Month | $/Call     |
| -------------- | ------- | ----------- | ---------- |
| Developer      | $0      | 100         | Free       |
| API Starter    | $49/mo  | 2,000       | $0.0245    |
| API Pro        | $199/mo | 10,000      | $0.0199    |
| API Enterprise | Custom  | 100,000+    | Negotiated |

---

## Revenue Projections

### Year 1 Breakdown

| Tier      | Customers    | ARPU        | MRR         | Annual       |
| --------- | ------------ | ----------- | ----------- | ------------ |
| Free      | 10,000       | $0          | $0          | $0           |
| Starter   | 200          | $9          | $1,800      | $21,600      |
| Pro       | 300          | $29         | $8,700      | $104,400     |
| Business  | 80           | $99         | $7,920      | $95,040      |
| API       | 20           | $100        | $2,000      | $24,000      |
| **Total** | **600 paid** | **$34 avg** | **$20,420** | **$245,040** |

### Year 2 Projections (3x growth)

| Tier      | Customers      | MRR         | Annual       |
| --------- | -------------- | ----------- | ------------ |
| Free      | 30,000         | $0          | $0           |
| Starter   | 600            | $5,400      | $64,800      |
| Pro       | 900            | $26,100     | $313,200     |
| Business  | 250            | $24,750     | $297,000     |
| API       | 50             | $8,750      | $105,000     |
| **Total** | **1,800 paid** | **$65,000** | **$780,000** |

---

## Cost Structure

### Variable Costs (Scale with Usage)

#### AI Processing (Largest Variable Cost)

**Real-ESRGAN via Replicate:**

| GPU             | Cost/Image | Speed | Use Case           |
| --------------- | ---------- | ----- | ------------------ |
| T4 (Standard)   | $0.0017    | ~1.8s | Free, Starter, Pro |
| A100 (Priority) | $0.0026    | ~0.7s | Business tier      |
| T4 + GFPGAN     | $0.0025    | ~2s   | Portrait mode      |

**Monthly Processing Costs:**

| Monthly Images | T4 Cost | A100 Cost |
| -------------- | ------- | --------- |
| 10,000         | $17     | $26       |
| 100,000        | $170    | $260      |
| 500,000        | $850    | $1,300    |

**Key Insight:** At $0.0017/image, we're 41-235x cheaper than competitors' per-image costs.

---

#### Storage Costs (Cloudflare R2)

**Pricing:** $0.015/GB/month

| Users   | Avg Storage | Monthly Cost |
| ------- | ----------- | ------------ |
| 10,000  | 500 GB      | $7.50        |
| 30,000  | 1.5 TB      | $22.50       |
| 100,000 | 5 TB        | $75.00       |

---

#### CDN (Cloudflare)

**Free tier:** First 10 TB/month
**Overage:** ~$0.05/GB

Most usage covered by free tier until significant scale.

---

### Fixed Costs

#### Infrastructure

| Service       | Purpose                | Monthly Cost      |
| ------------- | ---------------------- | ----------------- |
| Vercel Pro    | API + frontend hosting | $20-50            |
| Supabase Pro  | PostgreSQL database    | $25-100           |
| Upstash Redis | Job queue              | $10-30            |
| Cloudflare R2 | Object storage         | $0-50             |
| Sentry        | Error monitoring       | $26-100           |
| **Total**     |                        | **$81-330/month** |

---

#### Software & Tools

| Tool           | Purpose                 | Monthly Cost    |
| -------------- | ----------------------- | --------------- |
| GitHub Pro     | Code hosting            | $4              |
| Ahrefs/Semrush | SEO tools               | $99             |
| Customer.io    | Email automation        | $100            |
| Stripe         | Payments (2.9% + $0.30) | Variable        |
| Mixpanel       | Analytics               | $25             |
| Intercom       | Support                 | $74             |
| **Total**      |                         | **~$300/month** |

---

#### Team Costs

**Phase 1 (Months 1-6):** Solo + Contractors
| Role | Cost/Month |
|------|------------|
| Founder | $0 (sweat equity) |
| Content writer | $1,200 |
| Designer (as needed) | $500 |
| **Total** | **$1,700/month** |

**Phase 2 (Months 7-12):** Small Team
| Role | Cost/Month |
|------|------------|
| Content writer | $2,000 |
| Part-time VA | $800 |
| Designer | $1,000 |
| **Total** | **$3,800/month** |

**Phase 3 (Year 2+):** Full Team
| Role | Cost/Month |
|------|------------|
| Founder salary | $8,000 |
| Full-stack dev | $8,000 |
| Content marketer | $5,000 |
| Customer support | $4,000 |
| **Total** | **$25,000/month** |

---

## Total Cost Summary

### Month 6 (Growth Phase)

| Category                   | Cost       |
| -------------------------- | ---------- |
| Infrastructure             | $150       |
| AI Processing (50k images) | $85        |
| Storage                    | $15        |
| Software tools             | $300       |
| Marketing                  | $5,000     |
| Contractors                | $3,800     |
| **Total**                  | **$9,350** |

### Month 12 (Scale Phase)

| Category                    | Cost        |
| --------------------------- | ----------- |
| Infrastructure              | $300        |
| AI Processing (200k images) | $340        |
| Storage                     | $50         |
| Software tools              | $400        |
| Marketing                   | $8,000      |
| Team                        | $3,800      |
| **Total**                   | **$12,890** |

---

## Unit Economics

### Customer Acquisition Cost (CAC)

**Year 1 Target:** <$150

| Channel            | Estimated CAC |
| ------------------ | ------------- |
| SEO (organic)      | $50-100       |
| Product-led growth | $30-50        |
| Paid ads           | $200-400      |
| Partnerships       | $100-150      |
| **Blended**        | **$100-150**  |

### Customer Lifetime Value (LTV)

| Tier        | Monthly | Lifetime  | LTV       |
| ----------- | ------- | --------- | --------- |
| Starter     | $9      | 12 mo     | $108      |
| Pro         | $29     | 18 mo     | $522      |
| Business    | $99     | 24 mo     | $2,376    |
| **Blended** | **$34** | **16 mo** | **~$400** |

### LTV:CAC Ratio

- **Target:** 3:1 minimum
- **Projected:** $400 / $150 = **2.7:1** (Year 1)
- **Goal:** 4:1+ by Year 2 (improved CAC via SEO)

### Payback Period

- CAC: $150
- ARPU: $34/month
- **Payback:** 4.4 months ✅

### Gross Margin

| Tier        | Revenue | COGS  | Margin    |
| ----------- | ------- | ----- | --------- |
| Starter     | $9      | $0.42 | **95.3%** |
| Pro         | $29     | $1.50 | **94.8%** |
| Business    | $99     | $9.50 | **90.4%** |
| **Blended** |         |       | **~93%**  |

**Industry Comparison:**

- Traditional SaaS: 70-85%
- AI-intensive SaaS: 60-75%
- **myimageupscaler.com: 90-95%** (excellent!)

---

## Break-Even Analysis

```
Fixed Costs: ~$500/month (infrastructure only)
Variable Costs: ~5% of revenue

Break-even MRR: $500 / 0.95 = $526
Break-even customers: 17 (at $31 ARPU)

With full operating costs ($10,000/mo):
Break-even MRR: $10,000 / 0.93 = $10,753
Break-even customers: 317 (at $34 ARPU)
```

### Path to Profitability

| Milestone                 | MRR      | Customers | Timeline    |
| ------------------------- | -------- | --------- | ----------- |
| Infrastructure break-even | $526     | 17        | Month 2     |
| Operating break-even      | $10,753  | 317       | Month 8-10  |
| Profitability             | $15,000+ | 450+      | Month 10-12 |

---

## Pricing Optimization

### A/B Tests to Run

1. **Annual discount:** 17% vs 20% vs 25%
2. **Free tier limits:** 5 vs 10 vs 20 images
3. **Credit rollover:** 2x vs 3x multiplier
4. **Add-on bundling:** Separate vs bundled pricing

### Key Metrics to Track

- Plan distribution (which tiers sell)
- Upgrade/downgrade patterns
- Churn by plan
- Feature usage by plan
- Credit utilization rate

---

## Risk Mitigation

### API Price Increases

**Mitigation:**

- Multi-provider strategy (Stability AI, Hugging Face as backups)
- Self-hosting evaluation at 100k+ images/month
- Price increase clause in ToS

### High Churn

**Mitigation:**

- Credit rollover (reduces "use it or lose it" pressure)
- Annual plans (lock-in)
- Proactive customer success

### Low Conversion

**Mitigation:**

- A/B test free tier limits
- Improve onboarding flow
- Add high-value features to paid tiers

---

## Summary

| Metric                | Value                                    |
| --------------------- | ---------------------------------------- |
| **Pricing Model**     | Credit-based subscription                |
| **Entry Price**       | $9/mo (lowest in market for 100 credits) |
| **Gross Margin**      | 90-95%                                   |
| **Break-Even**        | 17 customers (infrastructure)            |
| **Year 1 MRR Target** | $20,000                                  |
| **LTV:CAC**           | 2.7:1 → 4:1                              |
| **Payback**           | 4-5 months                               |

---

_Last Updated: December 2025_
_See also: [Pricing Proposal](./economics/pricing-proposal-v2.md), [Image Models](./economics/image-upscaling-models.md)_
