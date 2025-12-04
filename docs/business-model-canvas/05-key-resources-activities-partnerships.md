# Key Resources, Activities & Partnerships

## KEY RESOURCES

### 1. Technology Resources

#### Primary: Real-ESRGAN via Replicate API

**Why Real-ESRGAN:**
- Best cost-performance ratio ($0.0017/image on T4)
- Sub-2-second processing
- Production-proven quality (8.5/10)
- No minimum commitments
- Linear scaling

**Model Stack:**

| Model | Cost/Run | Speed | Use Case |
|-------|----------|-------|----------|
| Real-ESRGAN (T4) | $0.0017 | ~1.8s | Standard (Free, Starter, Pro) |
| Real-ESRGAN (A100) | $0.0026 | ~0.7s | Priority (Business tier) |
| Real-ESRGAN + GFPGAN | $0.0025 | ~2s | Portrait enhancement |

**Backup Providers (Risk Mitigation):**
- Stability AI (outage fallback)
- Hugging Face (custom models)
- Self-hosted GPUs (at 300k+ images/month)

---

#### Cloud Infrastructure Stack

| Component | Provider | Purpose | Cost |
|-----------|----------|---------|------|
| **Frontend** | Vercel | Next.js hosting, edge functions | $20-50/mo |
| **Backend** | Vercel Serverless | API routes, business logic | Included |
| **Database** | Supabase | PostgreSQL, auth, realtime | $25-100/mo |
| **Storage** | Cloudflare R2 | Image uploads/downloads | $0.015/GB |
| **CDN** | Cloudflare | Fast image delivery | Free-$50/mo |
| **Queue** | Upstash Redis | Job management, rate limiting | $10-30/mo |
| **Monitoring** | Sentry | Error tracking | $26-100/mo |

**Total Infrastructure:** $100-350/month (scales with usage)

---

### 2. Intellectual Property

#### Text/Logo Preservation Algorithm (UNIQUE)

**Status:** To be developed (MVP Phase 2)

**Approach:**
- OCR integration to detect text regions
- Selective enhancement (avoid text areas)
- Edge-preserving filters for logos
- Custom post-processing

**Competitive Moat:**
- No competitor solves this
- Validated pain point (500+ user complaints)
- Technical barrier to entry

---

#### Brand & Domain

**Domain:** pixelperfect.ai (or similar)

**Brand Investment:**
- Premium domain: $2,000-5,000
- Logo and identity: $1,000-2,000
- Total: $3,000-7,000

---

#### Content Library (SEO Asset)

**Year 1 Target:**
- 100+ blog posts
- 30+ how-to guides
- 20+ comparison pages
- Video tutorials

**Investment:** $30,000 (content budget)
**ROI:** 10:1+ long-term

---

### 3. Human Resources

#### Phase 1: Solo + Contractors (Months 1-6)

| Role | Cost/Month |
|------|------------|
| Founder (product/strategy) | $0 |
| Content writer (2 posts/week) | $1,200 |
| Designer (as needed) | $500 |
| **Total** | **$1,700** |

#### Phase 2: Small Team (Months 7-12)

| Role | Cost/Month |
|------|------------|
| Part-time VA (support) | $800 |
| Additional content writer | $800 |
| **Total** | **$3,800** |

#### Phase 3: Full Team (Year 2+)

| Role | Cost/Month |
|------|------------|
| Founder/CEO | $8,000 |
| Full-stack developer | $8,000 |
| Content marketer | $5,000 |
| Customer success | $4,000 |
| **Total** | **$25,000** |

---

### 4. Financial Resources

**Minimum Viable Capital:** $30,000

**12-Month Runway:**
- Infrastructure: $3,000
- Marketing: $50,000
- Team: $30,000
- Tools: $4,000
- Buffer: $5,000
- **Total:** ~$92,000 (lean mode)

---

## KEY ACTIVITIES

### 1. Product Development

#### MVP Phase (Months 1-3)

**Core Features:**
- Image upload (drag-and-drop)
- 2x/4x upscaling via Real-ESRGAN
- Basic enhancement presets
- Before/after comparison
- User auth (Supabase)
- Credit system
- Stripe payments
- Basic batch (10 images)

**Tech Stack:**
- Frontend: Next.js 15 (App Router)
- Backend: Serverless API routes
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Payments: Stripe
- Storage: Cloudflare R2
- Queue: Upstash Redis

**Development Time:** 6-8 weeks

---

#### Growth Phase (Months 4-8)

**Features:**
- Text/logo preservation mode (UNIQUE)
- Platform presets (Shopify, Instagram, etc.)
- Batch processing (50-500 images)
- API access
- Shopify app integration
- Download history

**Development Time:** 12-16 weeks

---

#### Scale Phase (Months 9-12)

**Features:**
- Advanced analytics
- White-label option
- SSO/SAML (Business tier)
- Webhook integrations
- Performance optimization
- Mobile app (if validated)

---

### 2. Marketing & Acquisition

#### SEO (40% of effort/budget)

**Weekly Cadence:**
- 2-3 blog posts
- 5-10 hours keyword research
- 10-15 link outreach emails
- Update 2-3 existing posts

**Monthly Goals:**
- 10-12 new posts
- 2-3 quality backlinks
- 20% traffic growth MoM

---

#### Product-Led Growth (20%)

**Weekly Tasks:**
- Analyze activation funnel
- A/B test onboarding
- Optimize email sequences
- User feedback collection

**Monthly Goals:**
- Improve signup rate 5-10%
- Increase conversion 0.1-0.2%

---

#### Paid Advertising (15%)

**Weekly Tasks:**
- Monitor ad performance
- Test new creatives
- Analyze CAC by channel

**Monthly Goals:**
- Maintain CPA <$200
- Test 3-5 new audiences

---

### 3. Customer Support

#### Early Stage (Months 1-6)
- Founder-led support
- Every email personally
- Live chat during business hours
- 5-10 hours/week

#### Growth Stage (Months 7-12)
- Part-time VA for Tier 1
- Founder handles escalations
- Target: <2 hour response time

---

## KEY PARTNERSHIPS

### 1. Technology Partners

#### Replicate (Primary AI Provider)

**Benefits:**
- Access to latest models
- Technical support
- Potential co-marketing

**Relationship:**
- Stay updated on new models
- Provide power-user feedback
- Enterprise agreement at scale

---

#### Stripe (Payments)

- Reliable processing
- Subscription management
- Global currency support
- Cost: 2.9% + $0.30/transaction

---

### 2. Distribution Partners

#### Shopify

**Value:**
- Access to 2M+ merchants
- Built-in App Store discovery
- Trust signal

**Investment:**
- App development: $4,000
- Revenue share: 20% of first $1M

**Projected:**
- Year 1: 500-1,000 installs, 75-150 paid

---

#### WooCommerce/WordPress

**Value:**
- 43% of all websites
- Open-source credibility
- Free distribution

**Investment:**
- Plugin development: $2,000

---

### 3. Integration Partners

#### Zapier/Make.com

**Benefits:**
- Connect to 5,000+ apps
- Automated workflows
- Developer reach

**Requirements:**
- API (already building)
- Integration submission
- Documentation

---

### 4. Affiliate Partners

#### Photography Bloggers/YouTubers

**Targets:**
- PetaPixel
- Fstoppers
- Photography YouTube channels

**Structure:**
- 30% recurring commission
- Free Pro account
- Co-created content

---

#### E-commerce Educators

**Targets:**
- Shopify Blog
- Jungle Scout
- eCommerceFuel

**Opportunities:**
- Sponsored posts
- Webinar co-hosting
- Tool listicles

---

## RESOURCE PRIORITIZATION

### Months 1-3: Product + Foundation

| Activity | Allocation |
|----------|------------|
| Product Development | 80% |
| Marketing Setup | 15% |
| Admin | 5% |

---

### Months 4-8: Growth + Differentiation

| Activity | Allocation |
|----------|------------|
| Product Development | 40% |
| Marketing & Acquisition | 45% |
| Customer Support | 10% |
| Partnerships | 5% |

---

### Months 9-12: Scale + Optimize

| Activity | Allocation |
|----------|------------|
| Product Development | 30% |
| Marketing & Acquisition | 50% |
| Customer Success | 15% |
| Operations | 5% |

---

## SUCCESS METRICS

### Product
- Feature velocity: 2-4 features/month
- Bug turnaround: <24 hours
- Uptime: >99.5%
- Processing speed: <10 seconds avg

### Marketing
- Organic traffic: 20% MoM growth
- Keywords: Top 10 for 50+ by month 12
- Free signups: 500-1,000/month by month 6

### Customer
- CAC: <$150 blended
- Conversion: 3-5% free → paid
- MRR growth: 25% MoM (months 3-9)
- Churn: <8%/month

### Partnerships
- Shopify installs: 500 by month 12
- API users: 20 by month 12
- Affiliate revenue: 5% of total

---

## SCALING TRIGGERS

| Milestone | Action |
|-----------|--------|
| $20k MRR | Hire full-time developer |
| $30k MRR | Hire content marketer |
| $40k MRR | Hire customer success |
| 100k images/mo | Evaluate self-hosting |

---

## RISK MITIGATION

| Risk | Mitigation |
|------|------------|
| Replicate outage | Backup provider ready |
| Founder unavailable | Document everything |
| Payment issues | Backup processor (Paddle) |
| Key contractor quits | Multiple writers on rotation |

---

*Last Updated: December 2025*
*See also: [Revenue & Costs](./04-revenue-costs.md), [Overview](./00-overview.md)*
