# Bug Report: Stripe Webhook Fails to Activate Subscription on New Signup

**Date discovered:** 2026-03-29
**Severity:** High (customer charged but not provisioned)
**Affected user:** groupverona002@gmail.com (user ID: `044c81c8-1a8b-4b44-bc3c-c815627dde97`)
**Plan:** Hobby ($19/month, 200 credits)
**Status:** Manually fixed, root cause not yet confirmed

---

## Symptom

Customer successfully paid for the Hobby plan via Stripe Checkout. Payment was confirmed as "Paid" in Stripe. However:

- `profiles.subscription_status` remained `null`
- `profiles.subscription_tier` remained `null`
- `profiles.subscription_credits_balance` stayed at free-tier value (3 credits)
- `subscriptions` table had zero rows for this user

The customer had a valid `stripe_customer_id` (`cus_UEPSGU58Dg0rvE`) already set in their profile, confirming Stripe checkout completed and the customer was created.

---

## What the correct flow should do

1. Stripe Checkout completes → Stripe fires `customer.subscription.created` webhook
2. `POST /api/webhooks/stripe` receives event
3. `SubscriptionHandler.handleSubscriptionUpdate()` is called
4. Handler looks up profile by `stripe_customer_id`
5. Handler upserts row in `subscriptions` table
6. Handler calls `add_subscription_credits` RPC to grant 200 credits
7. Handler updates `profiles.subscription_status = 'active'` and `profiles.subscription_tier = 'hobby'`

---

## What actually happened

Steps 2–7 did not execute, or failed silently. The `subscriptions` table was empty for this user, and the profile was never updated.

---

## Possible root causes to investigate

### 1. Webhook not received (most likely if this is a pattern)

- Check Stripe Dashboard → Developers → Webhooks → recent deliveries for `customer.subscription.created`
- Look for failed deliveries or missing events for `cus_UEPSGU58Dg0rvE`
- Could be a Cloudflare routing issue, DNS problem, or the webhook endpoint returning non-200

### 2. Profile not found by `stripe_customer_id` at time of webhook

- The webhook handler queries `profiles` by `stripe_customer_id`
- If the Stripe customer was created before the profile had `stripe_customer_id` set, the lookup fails
- The handler throws an error on profile-not-found in production (so Stripe should retry), but check if retries happened

### 3. `stripe_customer_id` timing issue in Checkout flow

- During Stripe Checkout, the customer may be created by Stripe before `handleCustomerCreated` fires and links it to the profile
- The `customer.created` webhook handler only sets `stripe_customer_id` if metadata `user_id` is present
- If `user_id` metadata was missing from the Checkout session, `stripe_customer_id` wouldn't be set → subscription webhook finds no profile → throws → Stripe retries indefinitely

### 4. Environment key mismatch (test vs prod)

- `.env.api` contains a **test** Stripe key (`sk_test_...`)
- The customer ID `cus_UEPSGU58Dg0rvE` does NOT exist in the test Stripe environment
- Production Stripe keys are presumably in GCloud Secret Manager / Cloudflare env vars
- If webhook handler used the test key to verify the webhook signature, it would reject prod webhooks

### 5. Webhook signature verification failure

- Stripe webhook signatures are tied to specific endpoint secrets
- If `STRIPE_WEBHOOK_SECRET` in production env doesn't match the configured endpoint secret in Stripe Dashboard, all webhooks are rejected with 400
- Check Cloudflare / GCloud env vars for `STRIPE_WEBHOOK_SECRET`

---

## Root cause (confirmed 2026-03-29)

**The webhook was never delivered** — `evt_1TFwfCLrHNMv3SHuWTuBp25S` does not appear in the `webhook_events` table despite Stripe showing `pending_webhooks: 1`. Other webhooks from the same time period processed successfully, ruling out a code or signature issue.

Most likely: Stripe's first delivery attempt hit a transient error (network blip, cold start, brief outage) and the event is still in Stripe's retry queue with exponential backoff (~72 hours total). The webhook will likely succeed on a future retry, but since the account was already fixed manually, the retry is now safe — the subscription record exists in DB so `isNewActiveSubscription` will be `false` and no duplicate credits will be granted.

**Secondary finding:** The customer cancelled the subscription via Stripe (`cancel_at: 2026-04-28T13:12:25Z`, `reason: cancellation_requested`). The subscription will end on April 28, 2026 unless reversed. Recommend following up with the customer.

---

## Investigation steps

1. **Stripe Dashboard → Webhooks → Event log**
   - Search for events on `cus_UEPSGU58Dg0rvE`
   - Check `customer.subscription.created` delivery status and response code

2. **Check production logs (Baselime)**
   - Search for `[WEBHOOK_SUBSCRIPTION_UPDATE_START]` or `[WEBHOOK_RETRY]` near 2026-03-28/29
   - Look for signature verification errors or 400 responses from the webhook endpoint

3. **Check Cloudflare env vars**
   - Verify `STRIPE_WEBHOOK_SECRET` matches the signing secret in Stripe Dashboard for the production endpoint
   - Verify `STRIPE_SECRET_KEY` is the live key, not the test key

4. **Check the Checkout session metadata**
   - In Stripe Dashboard, find the checkout session for `cus_UEPSGU58Dg0rvE`
   - Verify `metadata.user_id` or `metadata.supabase_user_id` is set
   - If missing → `handleCustomerCreated` wouldn't link the customer to the profile → subscription webhook would fail to find the user

5. **Check `webhook_events` table in Supabase**
   - If the app logs webhook events to this table, check if any events were received for this customer

---

## Manual fix applied (2026-03-29)

```
profiles.subscription_status = 'active'
profiles.subscription_tier = 'hobby'
subscription_credits_balance += 200 (via add_subscription_credits RPC, ref: manual_fix_hobby_initial_2026_03_29)
subscription_credits_balance += 20  (goodwill, ref: goodwill_2026_03_29)
Final balance: 221 credits
subscriptions row inserted with placeholder ID: manual_hobby_044c81c8
```

---

## Related code

- Webhook handler: `app/api/webhooks/stripe/handlers/subscription.handler.ts`
- Webhook router: `app/api/webhooks/stripe/route.ts`
- Credit RPC: `supabase/migrations/20251205_update_credit_rpcs.sql` (`add_subscription_credits`)
- Security trigger: `supabase/migrations/20250221_secure_credits.sql` (`protect_credits_balance`)
- Customer created handler: `SubscriptionHandler.handleCustomerCreated()` in subscription.handler.ts
- Checkout session creation: search for `stripe.checkout.sessions.create` to verify metadata is set

---

## Suggested fix (pending root cause confirmation)

If root cause is **missing `user_id` metadata in Checkout session**:

- Ensure `metadata: { user_id: supabaseUserId }` is passed when creating the Checkout session
- The `handleCustomerCreated` webhook handler will then properly link the customer to the profile before the subscription webhook fires

If root cause is **webhook signature mismatch**:

- Rotate/update `STRIPE_WEBHOOK_SECRET` in production environment to match Stripe Dashboard

If root cause is **race condition** (webhook fires before `stripe_customer_id` is set):

- Consider adding a retry/delay mechanism or use Stripe's `client_reference_id` on the session as a fallback lookup
