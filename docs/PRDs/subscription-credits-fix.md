---
description: Fix for missing credits on upgrade and race conditions in subscription change flow
---

# PRD: Fix Subscription Credits & Upgrade Race Conditions

## 1. Context Analysis

### 1.1 Files Analyzed

- `server/services/SubscriptionCredits.ts`: Contains logic for calculating upgrade credits.
- `app/api/subscription/change/route.ts`: API endpoint handling manual plan changes.
- `app/api/webhooks/stripe/route.ts`: Webhook handler processing `customer.subscription.updated`.

### 1.2 Problem Statement

Users are not receiving credits when upgrading their subscription plan if they have a high existing balance (e.g., from rollover). This is due to aggressive "anti-farming" logic in `SubscriptionCredits.ts`. Additionally, there is a race condition where credits could be added twice because both the API endpoint and the Webhook handler attempt to add credits.

### 1.3 Current Behavior

1.  **Anti-Farming Block**: `SubscriptionCredits.ts` blocks credit addition if `currentBalance > 1.5 * previousTierCredits`. This penalizes legitimate users with high rollover balances.
2.  **Duplicate Logic**:
    - `change/route.ts`: Calculates and adds credits immediately upon user request.
    - `webhooks/stripe/route.ts`: specific logic also detects plan changes and adds credits.
    - **Risk**: If both execute successfully, the user receives double credits.

## 2. Proposed Solution

### 2.1 Architecture Summary

- **Simplify Credit Logic**: Change `SubscriptionCredits.ts` to always award the _difference_ in tier credits on upgrade, regardless of current balance.
- **Centralize Execution**: Remove credit addition logic from `change/route.ts`. Rely solely on the `customer.subscription.updated` webhook to handle credit/tier updates. This ensures a single source of truth.

### 2.2 Key Technical Decisions

- **Webhook-First Approach**: The API will only update the subscription in Stripe. The Webhook will handle the side effects (DB updates, credits). This accepts eventual consistency (seconds of delay) in exchange for correctness.

## 3. Detailed Implementation Spec

### A. `server/services/SubscriptionCredits.ts`

- **Modify `calculateUpgradeCredits`**:
  - Remove `REASONABLE_EXCESS_FACTOR` check.
  - Logic becomes: `creditsToAdd = max(0, newTierCredits - previousTierCredits)`.
  - Maintain negative check (no credits added on downgrade).

### B. `app/api/subscription/change/route.ts`

- **Modify `POST` handler**:
  - Keep: Auth checks, Stripe API call (`subscriptions.update`).
  - Remove: `SubscriptionCreditsService.calculateUpgradeCredits` call.
  - Remove: `rpc('increment_credits_with_log')`.
  - Return: Success 200 immediately after Stripe update.

### C. `app/api/webhooks/stripe/route.ts`

- **Verify**: Ensure `handleSubscriptionUpdate` correctly calls `SubscriptionCreditsService` with the previous plan details from `event.data.previous_attributes`.

## 4. Verification Plan

### Automated Tests

- Update `server/services/__tests__/SubscriptionCredits.test.ts` to verify that high-balance users still receive upgrade credits.

### Manual Verification

1.  **Upgrade Flow**: User with 500 cr (Hobby) upgrades to Pro (1000 cr). Result: 500 + 800 = 1300 cr.
2.  **Logs**: specific "Credits added" log appears only ONCE per transaction in Supabase logs.
