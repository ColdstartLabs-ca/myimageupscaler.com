---
name: stripe-integration
description: Implement Stripe payment flows, webhooks, and billing logic. Use when working with payments, subscriptions, checkout, or credit systems.
---

# Stripe Integration

## Key Files

- Webhook handler: `app/api/webhooks/stripe/route.ts`
- Stripe client: `server/services/stripe.service.ts`
- Subscription utils: `shared/config/subscription.utils.ts`

## Webhook Events

Handle these events for subscriptions:

- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Plan changes
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_succeeded` - Renewal
- `invoice.payment_failed` - Failed payment

## Webhook Security

```typescript
import Stripe from 'stripe';

const signature = request.headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
```

## Checkout Session

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer_email: user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}/pricing`,
  metadata: { userId: user.id },
});
```

## Credit System Pattern

1. Check credits before operation
2. Deduct credits atomically (use Supabase RPC)
3. Perform operation
4. Rollback credits on failure

## Testing

Use Stripe CLI for local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
