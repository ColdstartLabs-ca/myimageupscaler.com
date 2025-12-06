🧠 Principal Architect Mode: Engaged. Analyzing codebase constraints...

## 1. Context Analysis

### 1.1 Files Analyzed

- /home/joao/projects/pixelperfect/.cursor/rules/planning-documents.mdc
- /home/joao/projects/pixelperfect/app/api/checkout/route.ts
- /home/joao/projects/pixelperfect/app/api/webhooks/stripe/route.ts
- /home/joao/projects/pixelperfect/app/api/subscription/change/route.ts
- /home/joao/projects/pixelperfect/app/api/subscription/preview-change/route.ts
- /home/joao/projects/pixelperfect/app/api/subscriptions/cancel/route.ts
- /home/joao/projects/pixelperfect/shared/config/stripe.ts
- /home/joao/projects/pixelperfect/shared/config/subscription.config.ts
- /home/joao/projects/pixelperfect/shared/config/subscription.utils.ts
- /home/joao/projects/pixelperfect/server/services/SubscriptionCredits.ts
- /home/joao/projects/pixelperfect/server/services/subscription-sync.service.ts
- /home/joao/projects/pixelperfect/client/services/stripeService.ts
- /home/joao/projects/pixelperfect/app/pricing/page.tsx
- /home/joao/projects/pixelperfect/client/components/stripe/CreditPackSelector.tsx
- /home/joao/projects/pixelperfect/app/success/page.tsx
- /home/joao/projects/pixelperfect/app/subscription/confirmed/page.tsx
- /home/joao/projects/pixelperfect/supabase/migrations/20251205_update_credit_rpcs.sql

### 1.2 Component & Dependency Overview

graph TD
UI[Pricing/Billing UI<br/>app/pricing/page.tsx<br/>CreditPackSelector] -->|priceId, packKey| CheckoutAPI[/api/checkout/route.ts/]
CheckoutAPI -->|validates via| PricingConfig[Unified price/plan map]
CheckoutAPI -->|creates session| Stripe[Stripe]
Stripe -->|webhooks| Webhook[/api/webhooks/stripe/route.ts/]
Webhook -->|rpc add_subscription_credits / add_purchased_credits| SupabaseDB[(profiles, subscriptions,<br/>credit_transactions)]
Webhook -->|update| Profiles[profiles.subscription_status/tier<br/>subscriptions rows]
SuccessPage[app/success/page.tsx] -->|polls| SupabaseDB
StripePortal[/api/subscription/*, portal] --> Stripe
Scripts[scripts/fix-subscription.ts, subscription-sync.service.ts] --> SupabaseDB

### 1.3 Current Behavior Summary

- Two divergent pricing configs: shared/config/stripe.ts (auto-generated price IDs like price_1Sb...) and shared/config/subscription.config.ts (different price IDs price_1SZ... + credit packs). They
  are consumed inconsistently across UI, checkout, and webhooks.
- Checkout validates subscriptions with getPlanForPriceId from shared/config/stripe.ts, but credit packs via subscription.utils; session metadata is set accordingly.
- Webhook customer.subscription.\* handler requires getPlanConfig from subscription.config.ts; on unknown price it returns early, so no subscription/profile upsert occurs while the event is marked
  completed—active subscribers remain “free” with no DB record.
- Webhook credit grants rely on Supabase RPCs (add_subscription_credits, add_purchased_credits) using service role; invoice handler adds credits even when plan config is missing, but status/tier may
  stay null.
- Pricing UI (app/pricing/page.tsx) and plan-change flows use shared/config/stripe.ts; success/confirmation pages and some copy use subscription.utils, causing plan-name mismatches and blank states
  when IDs differ.
- Success page polls profile balances; if subscription/profile rows are missing, users see free tier and unchanged credits despite Stripe success.
- SubscriptionCreditsService is used for upgrade calculations; sync service exists but depends on known plan IDs to map tiers.

### 1.4 Problem Statement

Subscription and credit purchases succeed in Stripe but fail to update app state because pricing is defined in two conflicting configs; the webhook short-circuits on “unknown” price IDs, preventing
subscription records, profile tiers, and credit grants from being reliably persisted.

———

## 2. Proposed Solution

### 2.1 Architecture Summary

- Establish a single source of truth for all prices/plans/credit packs (derive STRIPE_PRICES, SUBSCRIPTION_PLANS, credit pack map from subscription.config.ts or a new unified resolver) and remove
  divergence between configs.
- Update checkout, webhook, plan-change, and UI surfaces to consume the unified resolver; unknown price IDs should either be rejected at checkout or handled with a deterministic fallback that still
  persists subscription rows.
- Harden webhook processing: do not mark events completed on unknown/misconfigured prices; always upsert subscriptions/profiles with fallback names, and surface errors so Stripe retries instead of
  silently dropping events.
- Align all display surfaces (pricing page, success/confirmed pages, status components) to the same plan/pack map so plan names and credits are consistent.
- Run a backfill/repair pass (using existing scripts/fix-subscription.ts or a new script) to sync existing Stripe subscriptions into subscriptions and update profiles.subscription_status/tier, plus
  reconcile missing credit transactions if any.

Alternative rejected: keeping dual configs and manually re-syncing price IDs—high drift risk and repeat of current silent failure; unifying the resolver eliminates the class of mismatch bugs.

### 2.2 Architecture Diagram

flowchart LR
Config[Unified Pricing Config<br/>(plans + credit packs)] --> CheckoutAPI[/api/checkout/]
Config --> Webhook[/api/webhooks/stripe/]
Config --> UI[Pricing/Billing UI]
CheckoutAPI --> Stripe[Stripe Checkout]
Stripe --> Webhook
Webhook -->|upsert| DB[(profiles, subscriptions, credit_transactions)]
Webhook -->|credits RPCs| DB
UI -->|supabase client| DB
Repair[Backfill Script] -->|Stripe list/sub retrieve| DB

### 2.3 Key Technical Decisions

- Library reuse: Keep existing Supabase RPCs (add_subscription_credits, add_purchased_credits) and Stripe SDK; add a unified resolver module rather than new dependencies.
- Error handling: Unknown price IDs cause webhook to throw (marking event failed for retry) after logging payload; checkout rejects non-allowlisted prices. Fallback plan name (priceId echo) is used for
  persistence to avoid empty records when retrying.
- Performance: Cache the resolved config in-memory per request scope to avoid repeated lookups; no new heavy queries introduced.
- Reuse: Derive STRIPE_PRICES, SUBSCRIPTION_PLANS, and homepage tiers from the single config to keep UI/back-end aligned.

### 2.4 Data Model Changes

- No Data Changes. Data repair/backfill only (populate subscriptions and profiles rows for existing Stripe customers).

### 2.5 Runtime Execution Flow

sequenceDiagram
participant UI
participant Checkout as /api/checkout
participant Stripe
participant Webhook as /api/webhooks/stripe
participant DB as Supabase RPC/DB

    UI->>Checkout: createCheckoutSession(priceId)
    Checkout->>Checkout: resolvePlanOrPack(priceId)
    alt unknown price
      Checkout-->>UI: 400 INVALID_PRICE
    else valid
      Checkout->>Stripe: checkout.sessions.create(mode, metadata)
      Stripe-->>UI: session url/id
    end

    Stripe-->>Webhook: checkout.session.completed
    Webhook->>Webhook: resolvePlanOrPack(priceId)
    alt resolver fails
      Webhook-->>Stripe: 500 (event failed; retry)
    else subscription mode
      Webhook->>DB: upsert subscriptions + profiles (status/tier)
      Webhook->>DB: rpc add_subscription_credits(ref invoice/session)
    else payment mode
      Webhook->>DB: rpc add_purchased_credits(ref pi/session)
    end
    DB-->>Webhook: success
    Webhook-->>Stripe: 200 received
    UI->>DB: poll profile/subscription
    DB-->>UI: updated tier + balances

———

## 3. Detailed Implementation Spec

### A. shared/config/subscription.config.ts & shared/config/stripe.ts

- Changes Needed: Make subscription.config.ts the canonical definition; generate/export STRIPE_PRICES, SUBSCRIPTION_PLANS, and credit pack map from it. Replace hardcoded IDs in shared/config/stripe.ts
  with derived exports and re-export helpers so existing imports keep working.
- Pseudo-code:

// subscription.utils
export const pricingIndex = buildIndexFromConfig(); // map priceId -> plan/pack metadata
export function resolvePriceId(priceId){ return pricingIndex[priceId] ?? null; }

// stripe.ts
import { pricingIndex, buildStripeConstants } from './subscription.utils';
export const { STRIPE_PRICES, SUBSCRIPTION_PLANS, CREDIT_PACKS } = buildStripeConstants();
export const getPlanForPriceId = (id) => pricingIndex[id]?.type === 'plan' ? pricingIndex[id].plan : null;

- Justification: Eliminates drift between configs and guarantees every consumer uses the same price IDs and metadata.

### B. shared/config/subscription.utils.ts

- Changes Needed: Add a single resolvePlanOrPack(priceId) returning normalized data {type:'plan'|'pack', key, name, creditsPerCycle/credits, maxRollover}; expose a guard assertKnownPriceId for API
  validation. Ensure credit pack IDs and plan IDs share the same index.
- Justification: Central resolver prevents silent fall-through and reduces repeated lookup logic across APIs/webhooks.

### C. app/api/checkout/route.ts

- Changes Needed: Replace dual lookups with resolvePlanOrPack; reject if null. Remove redundant Stripe price-type checks in favor of resolver metadata and Stripe verify. Ensure metadata uses unified
  keys (plan_key, pack_key, type).
- Justification: Blocks invalid prices at entry and keeps session metadata consistent for webhook processing.

### D. app/api/webhooks/stripe/route.ts

- Changes Needed: Use unified resolver in handleSubscriptionUpdate, handleCheckoutSessionCompleted, and handleInvoicePaymentSucceeded. If resolver returns null, throw to mark event failed (Stripe
  retry) and log the priceId; never return early without upserting subscription/profile. When plan metadata missing, still upsert subscription with price*id and set subscription_tier to Unknown
  (price*...) to avoid “free” state, but keep webhook failed so config can be fixed and retried.
- Justification: Prevents silent loss of subscription records; ensures status/tier always updated or retried.

### E. app/api/subscription/change/route.ts and preview-change/route.ts

- Changes Needed: Validate target/current price IDs via unified resolver; remove reliance on stale plan maps. Ensure downgrade/upgrade detection uses resolver credits, not split configs.
- Justification: Plan changes must use the same source to avoid future mismatches.

### F. client/services/stripeService.ts & UI components

- Changes Needed: Update pricing and plan-name rendering (app/pricing/page.tsx, SubscriptionStatus, success/confirmed pages, CreditPackSelector) to consume the unified resolver/exports so IDs and names
  are consistent. Remove usages of the stale subscription.utils plan lookup where it conflicts.
- Justification: Align UI with backend validation and avoid blank states when IDs drift.

### G. server/services/subscription-sync.service.ts & scripts/fix-subscription.ts

- Changes Needed: Use unified resolver for plan names during sync. Add a repair script/flag to backfill subscriptions and profiles for customers whose webhooks were dropped (list subscriptions from
  Stripe, upsert rows, set tier/status).
- Justification: Repairs existing bad data and prevents future divergence.

### H. Observability & safeguards

- Changes Needed: Add structured logging for “unknown priceId” cases and webhook failures; optionally add a lightweight metric counter for failed resolver lookups. Consider a health check that asserts
  all Stripe prices in config exist in the index.
- Justification: Early detection of config drift before it impacts users.

———

## 4. Step-by-Step Execution Plan

#### Phase 1: Unify Pricing Config

- [ ] Refactor subscription.utils to build a single price index (plans + packs) and export derived constants.
- [ ] Update shared/config/stripe.ts to re-export derived constants/helpers; remove hardcoded IDs.
- [ ] Add unit tests covering resolver for all price IDs.

#### Phase 2: Backend Alignment

- [ ] Update /api/checkout to use the unified resolver and consistent metadata.
- [ ] Update /api/webhooks/stripe handlers to require resolver hits; ensure subscription/profile upsert always runs or fails loudly.
- [ ] Update subscription change/preview routes to use unified credits metadata.

#### Phase 3: Frontend Alignment

- [ ] Switch pricing page, success/confirmed pages, and status components to unified plan/pack helpers and names.
- [ ] Ensure CreditPackSelector uses the same price IDs as checkout validation.

#### Phase 4: Data Repair & Safety Nets

- [ ] Enhance scripts/fix-subscription.ts (or add a new script) to backfill subscriptions/profile tiers using Stripe’s subscription list and unified resolver.
- [ ] Run backfill in a safe environment, verify a sample of affected users, and keep the script for future incidents.
- [ ] Add logging/alerts for resolver misses in webhook processing.

#### Phase 5: Testing & Verification

- [ ] Unit tests for resolver, webhook subscription update (unknown vs known price), and checkout validation.
- [ ] Integration test (or manual run) simulating customer.subscription.created and checkout.session.completed to confirm DB rows and credits update.
- [ ] UI smoke test for pricing page selection and success page polling.

———

## 5. Testing Strategy

Unit Tests

- Resolver: each known priceId returns correct type/name/credits; unknown returns null.
- Webhook: subscription update throws/logs on unknown price and does not mark event completed; known price upserts subscription/profile.
- Checkout: rejects invalid priceId, accepts valid plan and pack IDs, sets correct metadata.

Integration Tests

- Mock Stripe webhook for customer.subscription.created + invoice.payment_succeeded: verify subscriptions row, profiles.subscription_status/tier, and credit transaction added.
- Checkout session completed with credit pack: verify add_purchased_credits called and balance increases.
- Plan change preview/execute with unified IDs: ensure upgrade/downgrade detection works.

Edge Cases
| Scenario | Expected Behavior |
| --- | --- |
| Unknown priceId in webhook | 500 + retry; no “completed” idempotency; log includes priceId |
| Credit pack priceId drift | Checkout rejects; alert via log |
| Subscription created with missing period fields | Fallback fetch from Stripe; still upsert with timestamps |
| Duplicate webhook | Idempotency table skips processing but retains prior successful state |

———

## 6. Acceptance Criteria

- [ ] All Stripe price IDs (plans + packs) resolve from a single config, and no stale hardcoded IDs remain.
- [ ] customer.subscription.\* webhooks always create/update subscriptions rows and set profiles.subscription_status/subscription_tier for valid price IDs; unknown IDs trigger retry instead of silent
      success.
- [ ] Credit pack purchases add to purchased_credits_balance via webhook and appear in credit_transactions.
- [ ] Pricing UI and success/confirmation views display the correct plan names for any active subscription.
- [ ] Backfill script fixes existing users so an active Stripe subscription yields a non-null subscriptions row and profile tier.
- [ ] Unit/integration tests covering resolver, checkout validation, and webhook flows are passing.

———

## 7. Verification & Rollback

- Success Criteria: Sample subscription purchase shows profile tier updated and credits increased; credit pack purchase increments purchased_credits_balance; no “unknown priceId” logs in webhook after
  deploy; backfill report shows zero missing subscriptions.
- Rollback Plan: If deploy causes errors, revert to previous config module and disable new resolver usage; pause webhook endpoint by returning 500 to prevent bad writes; backfill script is non-
  destructive (upserts) and can be rerun after rollback.
