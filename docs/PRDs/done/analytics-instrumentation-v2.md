# Analytics Instrumentation V2 — Close the Blind Spots

## Context

We have a solid Amplitude integration (42 event types, ~22 actively tracked) but critical gaps are preventing data-driven decisions. The Feb 2026 traffic spike (957 WAU peak) can't be attributed to any source. We can't distinguish return visitors from new users. We don't know if users engage with model selection or just use defaults.

**Data from Feb 2026 snapshot:**

- 2,020 total users, 6 paying (0.30% conversion)
- 1.2% Day-1 retention (industry baseline: 20-30%)
- 23% page-view → download conversion
- 77% never try the core feature
- 12% of paywall-hitters click upgrade
- No idea what caused the Feb 10-11 viral spike

## Problem Statement

Seven analytics gaps prevent us from making informed product decisions:

| #   | Gap                                        | Business Impact                                        |
| --- | ------------------------------------------ | ------------------------------------------------------ |
| 1   | No persistent anonymous identity           | Can't measure true retention or return visits          |
| 2   | No `pricing_page_viewed` event             | Can't optimize the pricing → checkout funnel           |
| 3   | No `checkout_abandoned` tracking           | Don't know where people drop off in payment            |
| 4   | No `image_uploaded` event                  | Can't measure activation (upload → process → download) |
| 5   | No UTM persistence across sessions         | Can't attribute the Feb traffic spike or any channel   |
| 6   | No `plan` user property synced from Stripe | Can't segment paid vs. free behavior in Amplitude      |
| 7   | No model gallery interaction events        | Can't answer "do users engage with model selection?"   |

## Goals

1. Close all 7 analytics gaps within a single sprint
2. Enable proper Amplitude identity resolution (anonymous → identified)
3. Answer the UX simplification question: "do users care about model selection?"
4. Enable attribution for future traffic spikes

## Non-Goals

- Retention mechanics (PRD 2)
- Conversion optimization / paywall changes (PRD 3)
- Building custom dashboards or reports
- Changing the analytics provider

## Implementation Spec

### Phase 1: Identity & User Properties (Priority: CRITICAL)

#### 1A. Persistent Anonymous Identity

Amplitude's Browser SDK already generates a `device_id`, but it's not explicitly persisted across sessions for anonymous users. We need to ensure it works correctly.

**File:** `client/analytics/analyticsClient.ts`

- On SDK init, configure `defaultTracking: { sessions: true, pageViews: false }` (we handle pageViews manually)
- Ensure Amplitude's `device_id` is stored in `localStorage` (the SDK does this by default, but verify)
- When a user signs up or logs in, call `amplitude.setUserId(userId)` — this merges the anonymous device history with the user ID automatically
- Add a `getDeviceId()` method exposed from the analytics client for server-side correlation

**Amplitude Identity Resolution:**

```
Anonymous visit → device_id: "abc123"
  ... events tracked with device_id only
Sign up / Log in → amplitude.setUserId("user_456")
  ... Amplitude auto-merges device_id "abc123" with user "user_456"
  ... All prior anonymous events now attributed to user_456
```

#### 1B. Sync Plan User Property from Stripe Webhooks

**File:** `server/webhooks/stripe/subscription.handler.ts`, `server/webhooks/stripe/payment.handler.ts`

After processing subscription events, call `trackServerEvent` with an `$identify` event:

```typescript
// In subscription.handler.ts after subscription_created
await trackServerEvent(
  '$identify',
  {
    $set: {
      plan: 'pro', // or 'hobby', 'business', 'free'
      subscription_status: 'active',
      subscription_started_at: new Date().toISOString(),
      billing_interval: 'monthly',
    },
  },
  { apiKey: AMPLITUDE_API_KEY, userId }
);
```

Also set `plan: 'free'` on:

- `subscription_canceled` webhook
- `subscription_expired` (if exists)

**File:** `server/analytics/types.ts`

- Add `'$identify'` to `IAnalyticsEventName` union type

### Phase 2: Revenue & Purchase Analytics (Priority: CRITICAL)

Currently `checkout_completed`, `credit_pack_purchased`, `subscription_created`, and `subscription_canceled` are tracked via `trackServerEvent` — but as generic events, not using Amplitude's Revenue API. This means Revenue charts, LTV, and ARPU are unavailable in Amplitude.

#### 2A. Amplitude Revenue Tracking

**File:** `server/analytics/analyticsService.ts`

Add a `trackRevenue()` function that uses Amplitude's HTTP API revenue endpoint:

```typescript
export async function trackRevenue(
  userId: string,
  revenue: {
    productId: string; // e.g., 'subscription_pro_monthly', 'credit_pack_starter'
    price: number; // in dollars (e.g., 29.00)
    quantity: number; // usually 1
    revenueType: 'subscription' | 'credit_pack';
  }
) {
  await trackServerEvent(
    'revenue_received',
    {
      $revenue: revenue.price,
      $productId: revenue.productId,
      $quantity: revenue.quantity,
      $revenueType: revenue.revenueType,
      // Custom properties for segmentation
      plan: revenue.productId,
      amountCents: Math.round(revenue.price * 100),
    },
    { apiKey, userId }
  );
}
```

Note: Amplitude recognizes `$revenue`, `$productId`, `$quantity`, `$revenueType` as special revenue properties.

#### 2B. Track Revenue on Every Payment

**File:** `app/api/webhooks/stripe/handlers/payment.handler.ts`

After `checkout_completed`, also fire revenue:

```typescript
await trackRevenue(userId, {
  productId:
    purchaseType === 'subscription'
      ? `subscription_${planKey}_${billingInterval}`
      : `credit_pack_${packKey}`,
  price: (session.amount_total || 0) / 100,
  quantity: 1,
  revenueType: purchaseType === 'subscription' ? 'subscription' : 'credit_pack',
});
```

#### 2C. Track Subscription Renewals

**File:** `app/api/webhooks/stripe/handlers/invoice.handler.ts`

Add tracking for `invoice.payment_succeeded` when it's a recurring charge (not the first payment):

```typescript
// Only for recurring invoices (not first payment, which is handled by checkout_completed)
if (invoice.billing_reason === 'subscription_cycle') {
  await trackServerEvent(
    'subscription_renewed',
    {
      plan: planKey,
      amountCents: invoice.amount_paid,
      billingInterval: subscription?.items.data[0]?.price.recurring?.interval || 'month',
      renewalNumber: invoiceCount, // if available
    },
    { apiKey, userId }
  );

  await trackRevenue(userId, {
    productId: `subscription_${planKey}_${billingInterval}`,
    price: invoice.amount_paid / 100,
    quantity: 1,
    revenueType: 'subscription',
  });
}
```

#### 2D. Revenue User Properties

On every payment event, update user properties:

```typescript
// In payment handler, after successful payment
amplitude.identify(userId, {
  $set: {
    plan: planKey || 'free',
    subscription_status: 'active',
    billing_interval: billingInterval,
  },
  $add: {
    total_revenue_cents: amountCents,
    total_purchases: 1,
  },
});
```

This enables:

- **Revenue by product**: Subscriptions vs. credit packs
- **Revenue by plan**: Which tier sells most
- **ARPU**: Average revenue per user
- **LTV**: Lifetime value cohorts
- **MRR trends**: Month-over-month recurring revenue

### Phase 3: Missing Funnel Events (Priority: HIGH)

#### 3A. `image_uploaded` Event

**File:** `client/components/features/workspace/` (find the upload handler)

Track when a user adds an image to the workspace, BEFORE processing:

```typescript
analytics.track('image_uploaded', {
  fileSize: file.size,
  fileType: file.type,
  inputWidth: dimensions.width,
  inputHeight: dimensions.height,
  source: 'drag_drop' | 'file_picker' | 'paste' | 'url',
  isGuest: !userId,
  batchPosition: index, // which image in a batch
});
```

This creates the full activation funnel: `page_view → image_uploaded → image_upscaled → image_download`

#### 3B. `pricing_page_viewed` Event

**File:** `app/(pages)/pricing/page.tsx` or equivalent pricing page component

```typescript
analytics.track('pricing_page_viewed', {
  entryPoint: 'navbar' | 'batch_limit_modal' | 'out_of_credits_modal' | 'pseo_cta' | 'direct',
  currentPlan: userPlan || 'free',
  referrer: document.referrer,
});
```

Determine `entryPoint` by passing a query param or using `document.referrer` heuristics.

#### 3C. `checkout_abandoned` Event

**File:** `client/components/stripe/CheckoutModal.tsx`

The `checkout_abandoned` event type exists in the type system but is never fired. Track it when:

- User closes the CheckoutModal without completing
- User navigates away from the pricing page after viewing plans

```typescript
// In CheckoutModal onClose handler
analytics.track('checkout_abandoned', {
  priceId,
  step: 'stripe_embed', // or 'plan_selection'
  timeSpentMs: Date.now() - modalOpenedAt,
  plan: determinePlanFromPriceId(priceId),
});
```

### Phase 4: Model Selection Tracking (Priority: HIGH)

**Goal:** Answer "do users engage with model selection, or do 90% use the default?"

#### 4A. New Events

**File:** `client/components/features/workspace/BatchSidebar/QualityTierSelector.tsx`

```typescript
// When user opens the model gallery
analytics.track('model_gallery_opened', {
  currentTier: tier,
  isDefault: tier === 'quick', // or whatever the default is
  isFreeUser,
});
```

**File:** `client/components/features/workspace/ModelGalleryModal.tsx`

```typescript
// When user selects a different model
analytics.track('model_selection_changed', {
  fromTier: previousTier,
  toTier: newTier,
  isFreeUser,
  isPremiumTier: PREMIUM_TIERS.includes(newTier),
  timeInGalleryMs: Date.now() - galleryOpenedAt,
});

// When user closes gallery without changing
analytics.track('model_gallery_closed', {
  changed: selectedTier !== originalTier,
  viewedTiers: Array.from(viewedTiers), // which tabs/cards they looked at
  timeInGalleryMs: Date.now() - galleryOpenedAt,
});
```

**File:** `server/analytics/types.ts`

- Add `'model_gallery_opened'`, `'model_selection_changed'`, `'model_gallery_closed'`, `'image_uploaded'`, `'pricing_page_viewed'` to `IAnalyticsEventName`

**File:** `app/api/analytics/event/route.ts`

- Add new events to the whitelist

#### 4B. Key Metrics This Enables

In Amplitude, we can now answer:

- **Gallery open rate**: What % of sessions include `model_gallery_opened`?
- **Change rate**: What % of gallery opens result in `model_selection_changed`?
- **Default usage**: What % of `image_upscaled` events use the default tier?
- **Premium interest**: How often do free users view premium tiers?

If gallery open rate < 10% and change rate < 5%, we can simplify the UI.

### Phase 5: Attribution (Priority: MEDIUM)

#### 5A. UTM Persistence

**File:** `client/analytics/analyticsClient.ts` or `AnalyticsProvider.tsx`

UTMs are already captured on `page_view` events. Add persistence:

```typescript
// On first page_view with UTM params, store them
const utmParams = extractUTMs(window.location.search);
if (Object.keys(utmParams).length > 0) {
  localStorage.setItem(
    'miu_first_touch_utm',
    JSON.stringify({
      ...utmParams,
      landingPage: window.location.pathname,
      timestamp: Date.now(),
    })
  );

  // Set as user properties (first-touch attribution)
  amplitude.identify(
    new amplitude.Identify()
      .setOnce('first_touch_source', utmParams.utmSource)
      .setOnce('first_touch_medium', utmParams.utmMedium)
      .setOnce('first_touch_campaign', utmParams.utmCampaign)
      .setOnce('first_touch_landing', window.location.pathname)
  );
}
```

This means every future event from this user carries the original attribution.

### Phase 6: Event Whitelist & Types Update

**File:** `app/api/analytics/event/route.ts`

Add all new events to the whitelist array:

- `image_uploaded`
- `pricing_page_viewed`
- `checkout_abandoned`
- `model_gallery_opened`
- `model_selection_changed`
- `model_gallery_closed`

**File:** `server/analytics/types.ts`

Add all new event names to `IAnalyticsEventName` type.

## Validation Criteria

### Amplitude Dashboard Checks

- [ ] Anonymous user creates events → signs up → all events merge under one user ID
- [ ] Paying users have `plan` property set correctly
- [ ] `image_uploaded` appears in the event stream
- [ ] `pricing_page_viewed` fires on pricing page load
- [ ] `checkout_abandoned` fires when closing checkout modal
- [ ] `model_gallery_opened` fires when clicking the quality tier selector
- [ ] `model_selection_changed` fires when selecting a different tier
- [ ] UTM params persist as user properties on first touch

### Funnels Now Possible

1. **Activation funnel**: page_view → image_uploaded → image_upscaled → image_download
2. **Monetization funnel**: pricing_page_viewed → checkout_started → checkout_completed (or checkout_abandoned)
3. **Model engagement**: model_gallery_opened → model_selection_changed → image_upscaled
4. **Paywall funnel**: batch_limit_modal_shown → batch_limit_upgrade_clicked → pricing_page_viewed → checkout_started

## Testing

- Unit tests for UTM extraction and persistence
- Unit tests for `$identify` call in subscription webhook handlers
- Integration test: verify new events appear in Amplitude event whitelist
- Manual verification: check Amplitude debug view for each new event

## Rollout

1. Deploy all changes behind existing consent mechanism
2. Verify events in Amplitude's real-time debug view
3. Build the 4 funnels in Amplitude dashboard
4. After 1 week of data, generate first insights report
