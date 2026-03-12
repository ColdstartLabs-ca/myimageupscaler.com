# Checkout Recovery System

## Context

**Current state (March 2026):**

- 86 users started checkout but did not complete
- No mechanism to recover abandoned checkouts
- Email capture only happens post-download
- No cart state persistence across sessions
- No follow-up emails for abandoned checkouts
- No discount incentive system for recovery

**Key insight:** Users who click "Upgrade" have demonstrated purchase intent. Losing 86 users at the checkout stage represents significant revenue leakage. At a $5 average order value (AOV), this is $430 in immediate revenue lost, plus the lifetime value of those users.

**Dependency:** Analytics instrumentation is in place. `checkout_started`, `checkout_abandoned`, and `checkout_completed` events are already tracked in `server/analytics/types.ts`.

---

## Problem Statement

Users who initiate checkout but do not complete purchase have no recovery mechanism. Three specific gaps:

1. **No email capture at checkout start** - Anonymous users who browse pricing cannot be re-engaged if they leave
2. **No abandoned checkout email sequence** - Users who start but don't finish checkout receive no follow-up
3. **No cart persistence** - Returning users must reselect their plan, adding friction

---

## Goals

1. Capture email at checkout initiation for anonymous users
2. Implement 3-email abandoned checkout sequence (1hr, 24hr, 72hr)
3. Add discount code system for recovery incentive (10% off)
4. Persist cart state in localStorage for returning users
5. Recover 10%+ of abandoned checkouts within 8 weeks
6. Achieve 30%+ email open rate, 10%+ click rate

---

## Non-Goals

- Full account creation before checkout (increases friction)
- Push notifications for abandoned carts
- SMS recovery
- Retargeting ads (separate initiative)
- Changing base pricing (only discount codes)

---

## Proposed Solution

### Phase 1: Email Capture at Checkout Start

**Goal:** Capture email when user shows purchase intent, not after download.

#### 1A. Pre-Checkout Email Capture Modal

When an anonymous user clicks "Upgrade" or navigates to pricing, show an optional email capture:

```typescript
interface IPreCheckoutEmailCapture {
  email?: string;
  consent: boolean; // Marketing consent
  source: 'pricing_page' | 'upgrade_prompt' | 'out_of_credits' | 'premium_upsell';
  planId?: string; // Pre-selected plan
}
```

**Rules:**

- Only show to anonymous users (no auth token)
- Dismissible with "Continue without email" option
- Store email in localStorage (`miu_checkout_email`)
- If user proceeds to checkout, include email in session
- GDPR: explicit opt-in for marketing, transactional emails allowed

**Files to create:**

- `client/components/features/checkout/PreCheckoutEmailCapture.tsx`
- `client/hooks/usePreCheckoutEmail.ts`

**Analytics events:**

- `pre_checkout_email_shown` - properties: `source`, `hasPlanId`
- `pre_checkout_email_captured` - properties: `source`, `emailHash` (SHA-256)
- `pre_checkout_email_dismissed` - properties: `source`

#### 1B. Checkout API Enhancement

Modify `/api/checkout` to accept optional email for anonymous users:

```typescript
interface ICheckoutSessionRequest {
  // ... existing fields
  email?: string; // New: for anonymous abandoned checkout tracking
}
```

If email is provided:

- Create `abandoned_checkouts` record
- Store email with checkout session metadata
- Do NOT require email for checkout (backwards compatible)

---

### Phase 2: Abandoned Checkouts Database

**Goal:** Persist abandoned checkout state for email recovery.

#### 2A. Database Schema

New table: `abandoned_checkouts`

```sql
CREATE TABLE IF NOT EXISTS public.abandoned_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT, -- For anonymous users
  price_id TEXT NOT NULL,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('subscription', 'credit_pack')),
  plan_key TEXT,
  pack_key TEXT,
  pricing_region TEXT DEFAULT 'standard',
  discount_percent INTEGER DEFAULT 0,
  cart_data JSONB, -- Store full cart state for restoration
  recovery_discount_code TEXT, -- Generated discount code
  emails_sent JSONB DEFAULT '{"email_1hr": false, "email_24hr": false, "email_72hr": false}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recovered', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recovered_at TIMESTAMPTZ
);

-- Indexes for recovery queries
CREATE INDEX idx_abandoned_checkouts_user_id ON public.abandoned_checkouts(user_id);
CREATE INDEX idx_abandoned_checkouts_email ON public.abandoned_checkouts(email);
CREATE INDEX idx_abandoned_checkouts_created_at ON public.abandoned_checkouts(created_at DESC);
CREATE INDEX idx_abandoned_checkouts_status ON public.abandoned_checkouts(status);

-- RLS: Users can view their own abandoned checkouts
ALTER TABLE public.abandoned_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own abandoned checkouts"
  ON public.abandoned_checkouts FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all records
CREATE POLICY "Service role can manage abandoned checkouts"
  ON public.abandoned_checkouts FOR ALL
  USING (true);
```

**Migration file:** `supabase/migrations/20260311_create_abandoned_checkouts.sql`

#### 2B. Cart Data Structure

```typescript
interface IAbandonedCheckoutCartData {
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  planKey?: string;
  packKey?: string;
  pricingRegion: string;
  discountPercent: number;
  originalAmountCents: number;
  currency: string;
  createdAt: string;
}
```

---

### Phase 3: Discount Code System

**Goal:** Generate one-time discount codes for recovery emails.

#### 3A. Stripe Coupon Management

Create a Stripe coupon for abandoned checkout recovery:

```typescript
// Server-side coupon creation (one-time, run via script)
const recoveryCoupon = await stripe.coupons.create({
  amount_off: null, // Percentage based
  percent_off: 10,
  duration: 'once',
  name: 'Complete Your Purchase - 10% Off',
  metadata: {
    type: 'abandoned_checkout_recovery',
    reusable: 'false',
  },
});
```

**Environment variable:** Add `STRIPE_RECOVERY_COUPON_ID` to `.env.api`

#### 3B. One-Time Promotion Codes

For unique tracking, generate promotion codes tied to the coupon:

```typescript
interface IRecoveryDiscountCode {
  code: string; // e.g., "RECOVER-abc123"
  couponId: string;
  checkoutId: string;
  maxRedemptions: 1;
  expiresAt: Date; // 7 days from creation
}
```

Each abandoned checkout gets a unique promotion code for:
- Tracking which email converted
- Preventing code sharing (single use)
- Expiration after 7 days

---

### Phase 4: Email Sequence

**Goal:** 3-email sequence with escalating incentives.

#### 4A. Email Templates

| Email | Timing | Subject | Content |
|-------|--------|---------|---------|
| **Reminder** | 1 hour after abandonment | "Complete your purchase" | - Items in cart<br>- "Your cart is waiting"<br>- Direct link to checkout with cart restored |
| **Social Proof** | 24 hours after abandonment | "Your cart is waiting" | - Social proof: "X users upgraded today"<br>- Benefit reminder<br>- Checkout link |
| **Discount** | 72 hours after abandonment | "10% off - complete now" | - Discount code (10% off)<br>- Expiration: 7 days<br>- Urgency messaging |

#### 4B. Email Content Specifications

**Email 1 (1 hour):**
- Template: `abandoned-checkout-reminder`
- Tone: Helpful, neutral
- CTA: "Complete Your Purchase"
- Link: `/checkout?recover={checkoutId}` (restores cart state)

**Email 2 (24 hours):**
- Template: `abandoned-checkout-social-proof`
- Tone: Social proof, benefit-focused
- Dynamic stat: "Join X users who upgraded this week"
- CTA: "Complete Purchase"

**Email 3 (72 hours):**
- Template: `abandoned-checkout-discount`
- Tone: Incentive-focused, urgency
- Discount: Unique code for 10% off
- CTA: "Claim 10% Off - Complete Now"
- Expiration: Code expires in 7 days

#### 4C. Email Provider Integration

Use existing `EmailProviderManager` from `server/services/email-providers/`:

```typescript
import { getEmailProviderManager } from '@server/services/email-providers';

await getEmailProviderManager().send({
  to: email,
  templateName: 'abandoned-checkout-reminder',
  templateData: {
    checkoutId,
    planName,
    amount,
    recoveryUrl: `${baseUrl}/checkout?recover=${checkoutId}`,
  },
});
```

#### 4D: Abandoned Checkout Status

Stop sending emails if user:
- Completes a purchase (any plan/pack)
- Uses their recovery discount code
- 7 days pass (sequence complete)

---

### Phase 5: Cron Job for Recovery Emails

**Goal:** Scheduled job to send recovery emails at appropriate intervals.

#### 5A. Cron Endpoint

New API route: `/api/cron/recover-abandoned-checkouts`

```typescript
// Runs every 15 minutes via Vercel Cron or similar
export async function GET(request: NextRequest) {
  // Auth: Check cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    email1hr: await sendRecoveryEmails('1hr'),
    email24hr: await sendRecoveryEmails('24hr'),
    email72hr: await sendRecoveryEmails('72hr'),
  };

  return NextResponse.json(results);
}
```

#### 5B. Query Logic

```typescript
interface IRecoveryQuery {
  emailType: '1hr' | '24hr' | '72hr';

  // Query conditions
  status: 'pending';
  created_at: NOW() - INTERVAL;
  emails_sent->emailType: false;
}

const intervals = {
  '1hr': '1 hour',
  '24hr': '24 hours',
  '72hr': '72 hours',
};
```

For each matching checkout:
1. Generate unique discount code (72hr only)
2. Send email via EmailProviderManager
3. Update `emails_sent` field
4. Track analytics event

---

### Phase 6: Cart State Persistence

**Goal:** Restore cart state for returning users.

#### 6A. LocalStorage Schema

```typescript
interface ICheckoutLocalStorage {
  email?: string;
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  planKey?: string;
  packKey?: string;
  pricingRegion: string;
  discountPercent: number;
  recoveryCode?: string; // If returning from email
  timestamp: number; // Expire after 7 days
}
```

**Key:** `miu_pending_checkout`

#### 6B. Restoration Logic

On pricing page load:

```typescript
// client/hooks/useRestoreCart.ts
function useRestoreCart() {
  useEffect(() => {
    const stored = localStorage.getItem('miu_pending_checkout');
    if (!stored) return;

    const cart: ICheckoutLocalStorage = JSON.parse(stored);

    // Check expiration (7 days)
    if (Date.now() - cart.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem('miu_pending_checkout');
      return;
    }

    // Show restoration banner
    setShowRestoreBanner(true);
  }, []);
}
```

#### 6C. In-App Recovery Banner

Component: `CompletePurchaseBanner.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  Complete Your Purchase                                     │
│  You were looking at the Pro Plan ($9/mo).                  │
│  [Complete Purchase]  [Dismiss]                             │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**

- Only show if pending checkout exists in localStorage
- Show max once per session
- Include discount code if from recovery email
- Track `recovery_banner_shown`, `recovery_banner_clicked`

---

### Phase 7: Checkout Recovery URL Handler

**Goal:** Handle `?recover={checkoutId}` URL parameter.

#### 7A. Checkout Page Enhancement

On `/pricing` or `/dashboard/billing`:

```typescript
// app/(pages)/pricing/page.tsx
const searchParams = useSearchParams();
const recoverId = searchParams.get('recover');

useEffect(() => {
  if (recoverId) {
    // Fetch abandoned checkout data
    fetchAbandonedCheckout(recoverId).then((data) => {
      if (data) {
        // Restore cart state
        restoreCart(data.cart_data);
        // Apply discount code if present
        if (data.recovery_discount_code) {
          applyDiscountCode(data.recovery_discount_code);
        }
        // Show success toast
        toast.success('Your cart has been restored!');
      }
    });
  }
}, [recoverId]);
```

#### 7B. Recovery API Endpoint

New endpoint: `/api/checkout/recover/[checkoutId]`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { checkoutId: string } }
) {
  const { checkoutId } = params;

  // Fetch abandoned checkout
  const { data: checkout } = await supabaseAdmin
    .from('abandoned_checkouts')
    .select('*')
    .eq('id', checkoutId)
    .single();

  if (!checkout || checkout.status !== 'pending') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Return cart data (user_id check optional for anonymous recovery)
  return NextResponse.json({
    cartData: checkout.cart_data,
    discountCode: checkout.recovery_discount_code,
  });
}
```

---

## Analytics Events

Add to `server/analytics/types.ts`:

```typescript
// Pre-checkout email capture
export interface IPreCheckoutEmailShownProperties {
  source: 'pricing_page' | 'upgrade_prompt' | 'out_of_credits' | 'premium_upsell';
  hasPlanId: boolean;
}

export interface IPreCheckoutEmailCapturedProperties {
  source: string;
  emailHash: string; // SHA-256 hash
}

export interface IPreCheckoutEmailDismissedProperties {
  source: string;
}

// Recovery email events
export interface IRecoveryEmailSentProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
  hasDiscount: boolean;
}

export interface IRecoveryEmailOpenedProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
}

export interface IRecoveryEmailClickedProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
  hasDiscount: boolean;
}

// Recovery completion
export interface ICheckoutRecoveredProperties {
  emailNumber?: 1 | 2 | 3;
  discountUsed: boolean;
  discountCode?: string;
  hoursSinceAbandonment: number;
  recoverySource: 'email' | 'banner' | 'direct';
}

// Update existing checkout types
export interface ICheckoutStartedProperties {
  // ... existing fields
  recoveryCheckoutId?: string; // Link to abandoned checkout
  recoveryEmailNumber?: 1 | 2 | 3; // Which email triggered recovery
}
```

**Event types to add to `IAnalyticsEventName`:**
- `pre_checkout_email_shown`
- `pre_checkout_email_captured`
- `pre_checkout_email_dismissed`
- `recovery_email_sent`
- `recovery_email_opened` (via pixel tracking)
- `recovery_email_clicked`
- `checkout_recovered`

---

## Implementation Priority

| Phase | What | Effort | Expected Impact |
|-------|------|--------|-----------------|
| **1** | Pre-checkout email capture modal | 2-3 days | Capture 30-40% of anonymous checkout intent |
| **2** | Database schema + abandoned checkouts table | 1 day | Enable tracking and persistence |
| **3** | Discount code system + Stripe integration | 1-2 days | Create incentive for final email |
| **4** | Email templates + provider integration | 2-3 days | Core recovery mechanism |
| **5** | Cron job for scheduled emails | 1-2 days | Automated recovery sequence |
| **6** | Cart state persistence + restoration | 2 days | Reduce friction for return users |
| **7** | Recovery URL handler | 1 day | Seamless email-to-checkout flow |

---

## Database Schema Details

### Abandoned Checkouts Table

```sql
-- Migration: 20260311_create_abandoned_checkouts.sql

CREATE TABLE IF NOT EXISTS public.abandoned_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  price_id TEXT NOT NULL,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('subscription', 'credit_pack')),
  plan_key TEXT,
  pack_key TEXT,
  pricing_region TEXT DEFAULT 'standard',
  discount_percent INTEGER DEFAULT 0,
  cart_data JSONB DEFAULT '{}'::jsonb,
  recovery_discount_code TEXT,
  recovery_discount_id TEXT, -- Stripe promotion code ID
  emails_sent JSONB DEFAULT '{"email_1hr": false, "email_24hr": false, "email_72hr": false}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recovered', 'expired', 'bounced')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recovered_at TIMESTAMPTZ,
  first_email_sent_at TIMESTAMPTZ,
  second_email_sent_at TIMESTAMPTZ,
  third_email_sent_at TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX idx_abandoned_checkouts_user_id ON public.abandoned_checkouts(user_id);
CREATE INDEX idx_abandoned_checkouts_email ON public.abandoned_checkouts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_abandoned_checkouts_created_at ON public.abandoned_checkouts(created_at DESC);
CREATE INDEX idx_abandoned_checkouts_status_created ON public.abandoned_checkouts(status, created_at);
CREATE INDEX idx_abandoned_checkouts_emails_sent ON public.abandoned_checkouts USING GIN (emails_sent);

-- RLS Policies
ALTER TABLE public.abandoned_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own abandoned checkouts"
  ON public.abandoned_checkouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own abandoned checkouts"
  ON public.abandoned_checkouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.abandoned_checkouts FOR ALL
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_abandoned_checkouts_updated_at
  BEFORE UPDATE ON public.abandoned_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function: Mark checkout as recovered
CREATE OR REPLACE FUNCTION public.mark_checkout_recovered(checkout_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.abandoned_checkouts
  SET status = 'recovered',
      recovered_at = NOW(),
      updated_at = NOW()
  WHERE id = checkout_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Check if user has pending abandoned checkout
CREATE OR REPLACE FUNCTION public.get_pending_checkout(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  cart_data JSONB,
  recovery_discount_code TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.cart_data,
    ac.recovery_discount_code
  FROM public.abandoned_checkouts ac
  WHERE ac.user_id = user_uuid
    AND ac.status = 'pending'
    AND ac.created_at > NOW() - INTERVAL '7 days'
  ORDER BY ac.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## API Specifications

### POST /api/checkout (Enhanced)

**Request:**
```typescript
interface ICheckoutSessionRequest {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
  uiMode?: 'hosted' | 'embedded';
  email?: string; // NEW: Optional for anonymous tracking
  recoveryCheckoutId?: string; // NEW: Link to abandoned checkout
}
```

**Changes:**
1. If `email` provided, create `abandoned_checkouts` record on session start
2. If `recoveryCheckoutId` provided, mark as recovered and apply discount

### GET /api/checkout/recover/[checkoutId]

**Request:**
- Path param: `checkoutId` (UUID)

**Response:**
```typescript
interface IRecoveryResponse {
  success: boolean;
  data?: {
    cartData: IAbandonedCheckoutCartData;
    discountCode?: string;
    isValid: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### GET /api/cron/recover-abandoned-checkouts

**Authentication:** `Authorization: Bearer {CRON_SECRET}`

**Response:**
```typescript
interface IRecoveryCronResponse {
  success: boolean;
  data: {
    email1hr: { sent: number; failed: number };
    email24hr: { sent: number; failed: number };
    email72hr: { sent: number; failed: number };
    total: number;
  };
  timestamp: string;
}
```

### POST /api/checkout/abandoned

**Request:**
```typescript
interface IAbandonedCheckoutRequest {
  email?: string;
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  planKey?: string;
  packKey?: string;
  pricingRegion: string;
  discountPercent: number;
}
```

**Response:**
```typescript
interface IAbandonedCheckoutResponse {
  success: boolean;
  data?: {
    checkoutId: string;
  };
}
```

---

## Testing Strategy

### Unit Tests

- `preCheckoutEmailCapture.unit.spec.ts`: Modal shown/captured/dismissed logic
- `abandonedCheckoutCRUD.unit.spec.ts`: Database operations
- `discountCodeGeneration.unit.spec.ts`: Unique code generation
- `recoveryEmailTemplate.unit.spec.ts`: Template rendering with data
- `cartPersistence.unit.spec.ts`: LocalStorage read/write/expiration

### Integration Tests

- `checkoutRecoveryFlow.integration.spec.ts`: Full flow from abandon to recovery
- `emailSequence.integration.spec.ts`: Cron job sends emails at correct intervals
- `discountApplication.integration.spec.ts`: Discount codes apply correctly at checkout

### E2E Tests

- Anonymous user: Visit pricing → enter email → abandon → receive email → return via link → complete purchase
- Authenticated user: Start checkout → abandon → receive email → return → complete with discount
- Cart restoration: Abandon checkout → return to site → see banner → complete purchase
- Expiration: Old abandoned checkout → try to recover → get 404/expired message

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Email marked as spam** | Medium | High | Use established sender reputation, warm up dedicated IP, SPF/DKIM authentication |
| **Low open rates** | Medium | Medium | A/B test subject lines, optimize send times, personalize content |
| **Discount abuse** | Low | Medium | One-time use codes, 7-day expiration, IP-based rate limiting |
| **Privacy concerns** | Low | High | GDPR-compliant consent, hashed emails in analytics, clear unsubscribe |
| **Over-messaging users** | Medium | Low | Stop emails after conversion, cap at 3 emails per abandoned checkout |
| **Cron job failures** | Low | Medium | Health check endpoint, retry logic, alerting on failures |
| **LocalStorage cleared** | High | Low | Fallback to database record, email link always works |

---

## Success Criteria

### Primary Metrics

| Metric | Baseline | Target (8 weeks) |
|--------|----------|------------------|
| **Recovery rate** | 0% | 10%+ of abandoned checkouts |
| **Email open rate** | N/A | 30%+ |
| **Email click rate** | N/A | 10%+ |
| **Revenue recovered** | $0 | $43+ (10% of 86 users at $5 AOV) |

### Secondary Metrics

- Pre-checkout email capture rate: 25%+ of anonymous pricing visitors
- Cart restoration rate: 15%+ of returning users
- Discount usage rate: 80%+ of email-3 conversions
- Time to recovery: Average < 48 hours

### Validation Timeline

- **Week 1-2**: Phase 1-2 (email capture + database)
- **Week 3-4**: Phase 3-4 (discounts + email templates)
- **Week 5-6**: Phase 5-6 (cron + persistence)
- **Week 7-8**: Phase 7 (recovery URL) + measurement

---

## Dependencies

- **Email infrastructure**: `EmailProviderManager` exists (Brevo + Resend)
- **Analytics**: `checkout_started` and `checkout_abandoned` events already tracked
- **Stripe integration**: Existing coupon/promotion code APIs
- **Database**: Supabase with RLS policies

---

## Open Questions

1. **Email timing**: Should we adjust send times based on user timezone? (Use CF-IPCountry header)
2. **Discount percentage**: Is 10% optimal? Should we A/B test 5%, 15%, 20%?
3. **Sequence length**: Should we add a 4th email at 7 days (last chance)?
4. **Anonymous expiration**: Should anonymous records expire earlier than 7 days due to privacy?

---

## Future Enhancements

- **Dynamic discount amounts**: Higher discounts for higher-value abandoned carts
- **SMS recovery**: For users who provide phone number (higher opt-in friction)
- **Exit intent popup**: Capture email when user mouse-leaves pricing page
- **A/B testing**: Test different subject lines, email content, discount amounts
- **Segmentation**: Different recovery flows for subscriptions vs. credit packs
- **Analytics dashboard**: Admin view of abandoned checkout metrics
