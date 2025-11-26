import Stripe from 'stripe';
import { serverEnv, isProduction } from '@shared/config/env';

if (!serverEnv.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set. Stripe operations will fail.');
}

// Initialize Stripe client
// This will be used in API routes (server-side only)
// Use a dummy key in development if not set to prevent build failures
export const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build', {
  apiVersion: '2025-11-17.clover',
  typescript: true,
});

// Stripe webhook secret for signature verification
export const STRIPE_WEBHOOK_SECRET = serverEnv.STRIPE_WEBHOOK_SECRET;

// Validate webhook secret in production
if (isProduction() && !STRIPE_WEBHOOK_SECRET) {
  console.warn(
    'Warning: STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification will fail.'
  );
}
