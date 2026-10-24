# PRD: Account Deletion (Danger Zone)

**Complexity: 2 → LOW mode**

## 1. Context

**Problem:** Users cannot delete their own accounts — only admins can. We need a self-service "Danger Zone" section in Settings with a confirmation modal.

**Files Analyzed:**

- `app/[locale]/dashboard/settings/page.tsx` — current settings page (3 tabs: Profile, Notifications, Processing)
- `app/api/admin/users/[userId]/route.ts` — existing admin deletion logic (cascade: credit_transactions → subscriptions → profiles → auth.users)
- `client/components/stripe/CancelSubscriptionModal.tsx` — confirmation modal pattern to follow
- `client/components/stripe/ModalHeader.tsx` — reusable modal header
- `client/store/auth/authOperations.ts` — signOut logic (clears cache, state)
- `locales/en/dashboard.json` — i18n for settings page

**Current Behavior:**

- Settings page has Profile, Notifications, Processing tabs
- No account deletion UI for users
- Admin panel has a DELETE endpoint at `/api/admin/users/[userId]` with cascade delete
- CancelSubscriptionModal uses a two-step confirmation pattern (reason → confirm)

### Integration Points Checklist

**How will this feature be reached?**

- [x] Entry point: Settings page → Profile tab → Danger Zone section at bottom
- [x] Caller: `DeleteAccountModal` component, invoked from ProfileTab
- [x] Registration: Danger Zone section added inline to existing ProfileTab component

**Is this user-facing?**

- [x] YES → DeleteAccountModal component + Danger Zone section in ProfileTab

**Full user flow:**

1. User navigates to Dashboard → Settings → Profile tab
2. Scrolls to "Danger Zone" section at bottom
3. Clicks "Delete Account" button
4. Modal opens with warning: irreversible, data deleted, subscription canceled
5. User must type their email to confirm
6. Clicks "Delete My Account" → API call → Stripe subscription canceled → DB data deleted → auth user deleted → signed out → redirected to home

## 2. Solution

**Approach:**

- Add a "Danger Zone" section at the bottom of the Profile tab (red-bordered card, follows existing card pattern)
- New `DeleteAccountModal` with email-confirmation (must type email to unlock button), following CancelSubscriptionModal pattern
- New API route `POST /api/account/delete` — user-authenticated (not admin), reuses the same cascade delete logic
- API also cancels active Stripe subscription (immediate, not at period end) and deletes Stripe customer
- After successful deletion, call `signOut()` and redirect to home

**Key Decisions:**

- Email confirmation (not password) — works for both email/password and OAuth users
- `POST` not `DELETE` method — avoids CORS preflight issues, simpler client-side
- Immediate Stripe cancellation — user is deleting everything, no grace period needed
- Reuse existing cascade delete order from admin endpoint

**Data Changes:** None — uses existing tables, just deletes from them.

## 3. Execution Phases

### Phase 1: API Route + Delete Account Modal + Danger Zone UI

**Files:**

- `app/api/account/delete/route.ts` — new API endpoint
- `client/components/settings/DeleteAccountModal.tsx` — new confirmation modal
- `app/[locale]/dashboard/settings/page.tsx` — add Danger Zone to ProfileTab
- `locales/en/dashboard.json` — add i18n strings

**Implementation:**

**API Route (`app/api/account/delete/route.ts`):**

- [ ] POST handler, requires auth (not in PUBLIC_API_ROUTES)
- [ ] Extract user ID from `X-User-Id` header (set by middleware)
- [ ] Fetch profile to get `stripe_customer_id`
- [ ] If Stripe customer exists: cancel all active subscriptions, then delete customer via `stripe.customers.del()`
- [ ] Cascade delete: `credit_transactions` → `subscriptions` → `email_preferences` → `profiles` (same order as admin)
- [ ] Delete auth user via `supabaseAdmin.auth.admin.deleteUser(userId)`
- [ ] Return `{ success: true }`

**DeleteAccountModal (`client/components/settings/DeleteAccountModal.tsx`):**

- [ ] Props: `isOpen`, `onClose`, `userEmail`
- [ ] State: `emailInput`, `loading`, `error`
- [ ] Shows warning icon (Trash2) + "This action is permanent" messaging
- [ ] Lists what gets deleted: account data, processing history, subscription, credits
- [ ] Email confirmation input — button disabled until input matches `userEmail`
- [ ] On confirm: POST `/api/account/delete`, then call `signOut()`, redirect to `/`
- [ ] Reuse `ModalHeader` component from stripe components
- [ ] Error state shown inline

**Settings Page Changes:**

- [ ] Add Danger Zone section at bottom of ProfileTab (red-bordered card)
- [ ] "Delete Account" button opens DeleteAccountModal
- [ ] Pass user email to modal

**i18n Strings:**

- [ ] Add `dangerZone`, `dangerZoneSubtitle`, `deleteAccount`, `deleteAccountDescription` to `dashboard.settings`
- [ ] Add `deleteAccount` namespace to translations for modal strings

**Tests Required:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/api/account-delete.unit.spec.ts` | `should return 401 when not authenticated` | 401 response |
| `tests/unit/api/account-delete.unit.spec.ts` | `should delete user data in correct cascade order` | DB calls in order |
| `tests/unit/api/account-delete.unit.spec.ts` | `should cancel Stripe subscription before deleting` | Stripe cancel called |
| `tests/unit/api/account-delete.unit.spec.ts` | `should handle user with no Stripe customer` | Success without Stripe calls |

**User Verification:**

- Action: Go to Settings → Profile, scroll to bottom → click Delete Account → type email → confirm
- Expected: Modal closes, user signed out, redirected to home page, all data deleted

## 4. Acceptance Criteria

- [ ] Danger Zone section visible at bottom of Profile tab
- [ ] Delete button opens confirmation modal
- [ ] Modal requires email match to enable confirm button
- [ ] API deletes: credit_transactions, subscriptions, email_preferences, profiles, auth user
- [ ] Active Stripe subscriptions canceled and customer deleted
- [ ] User signed out and redirected after deletion
- [ ] All tests pass
- [ ] `yarn verify` passes
