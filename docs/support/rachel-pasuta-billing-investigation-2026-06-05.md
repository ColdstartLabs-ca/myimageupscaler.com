# Rachel Pasuta Billing Investigation

Date: 2026-06-05  
Customer: Rachel Pasuta  
Email: rjpasuta@hotmail.com  
Support category: Billing  
Request: Customer says she was charged a third time, wants May and June refunded, subscription canceled, and says expected 400 extra credits were not received.

Status: Resolved on 2026-06-05. Legacy subscription canceled and May/June legacy charges refunded.

## Summary

Supabase shows Rachel's account is currently canceled and has 141 subscription credits. Supabase recorded one paid Hobby subscription invoice on 2026-04-01 for USD $19.00 and granted 200 subscription credits for it. Supabase has no May or June paid invoice, subscription renewal, charge, payment intent, or subscription credit grant for this user.

The live Stripe key provided during investigation belongs to Stripe account `acct_1TPoZG17DctxcZv2`. On that account, Rachel has customer `cus_UUenJcxROxCv3Y`, but it has no charges, no invoices, no payment intents, and no subscriptions. It only has expired/unpaid checkout sessions for credit packs.

Important mismatch resolved: Supabase's April paid subscription data references Stripe customer `cus_UA4UAQa5KRpCT4`, invoice `in_1THUNzLrHNMv3SHuCxGE6EWF`, subscription `sub_1THUO1LrHNMv3SHuqxr5hLuK`, and checkout session `cs_live_a1NR5xj2JVisgsvBh38CMlaIn33vv9JtHYteRtLBG9zX1SReytmF9MfpJq`. These ids belong to the legacy personal Stripe account `acct_1SpEEtLrHNMv3SHu`, not the current corporation Stripe account `acct_1TPoZG17DctxcZv2`.

Rachel has now provided TD card screenshots showing two posted MyImageUpscaler card transactions that match the expected USD $19.00 monthly subscription price but were converted by TD into CAD:

- `docs/support/IMG_8384.png`: CAD $26.67, USD $19.00 converted at 0.71241, transaction date 2026-05-01, posted date 2026-05-04, card ending `9637`.
- `docs/support/IMG_8383.png`: CAD $26.94, USD $19.00 converted at 0.70527, transaction date 2026-06-01, posted date 2026-06-02, card ending `9637`.

These screenshots match successful May and June charges in the legacy personal Stripe account.

## Supabase Findings

Auth user:

- User id: `5e5c008b-14fd-4b1d-a781-4aaae0ce52c4`
- Email: `rjpasuta@hotmail.com`
- Created: 2026-03-16T22:35:07Z
- Last sign-in: 2026-06-03T17:11:37Z

Current profile:

- `stripe_customer_id`: `cus_UUenJcxROxCv3Y`
- `subscription_status`: `canceled`
- `subscription_tier`: null
- `subscription_credits_balance`: 141
- `purchased_credits_balance`: 0

Subscription mirror row:

- Subscription id: `sub_1THUO1LrHNMv3SHuqxr5hLuK`
- Status: `canceled`
- Price id: `price_1SpFABLrHNMv3SHuTF4yrF9D`
- Period start: 2026-04-01T19:25:13Z
- Period end: 2026-05-01T19:25:13Z
- Canceled at: 2026-04-26T03:05:40Z

Credit ledger:

- One subscription grant exists:
  - 2026-04-01T19:25:13Z
  - Amount: +200
  - Reference: `invoice_in_1THUNzLrHNMv3SHuCxGE6EWF`
  - Description: `Initial subscription credits - Hobby plan - 200 credits`
- No subscription credit grants exist for May 2026.
- No subscription credit grants exist for June 2026.
- Usage ledger by month:
  - March 2026: -6 credits
  - April 2026: +200 subscription, -253 usage
  - May 2026: -10 usage
- There is a manual ledger row:
  - Amount: -200
  - Reference: `manual_fix_double_credit_2026-04-01`
  - Description: `Manual fix: remove 200 duplicate credits from webhook race condition`
  - Note: the current profile balance reconciles as if this manual ledger row did not reduce the profile balance. Current balance math appears to be 10 signup credits + 200 April subscription credits - 69 real usage = 141.

Webhook events relevant to Rachel:

- 2026-03-16: `customer.created` for `cus_UA4UAQa5KRpCT4`
- 2026-04-01: `customer.subscription.created` for `sub_1THUO1LrHNMv3SHuqxr5hLuK`, customer `cus_UA4UAQa5KRpCT4`
- 2026-04-01: `checkout.session.completed`, customer `cus_UA4UAQa5KRpCT4`, Hobby plan, 200 credits
- 2026-04-01: `invoice.payment_succeeded`, invoice `in_1THUNzLrHNMv3SHuCxGE6EWF`, amount paid $19.00
- 2026-04-01: `invoice.paid`, same invoice
- 2026-05-10: `customer.created` for `cus_UUenJcxROxCv3Y`

No Supabase webhook rows from 2026-05-01 through 2026-06-05 matched Rachel's email or user id for:

- `invoice.payment_succeeded`
- `invoice.paid`
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

No failed or stuck webhook rows were found for Rachel in the late-April through early-June window.

## Stripe Findings

The supplied live Stripe key is for:

- Account id: `acct_1TPoZG17DctxcZv2`
- Account email: `admin@coldstartlabs.ca`
- Business name: MyImageUpscaler
- Default currency: CAD

Search by `rjpasuta@hotmail.com` on this account found:

- Customer: `cus_UUenJcxROxCv3Y`
- Created: 2026-05-10T22:06:11Z
- Metadata: `supabase_user_id=5e5c008b-14fd-4b1d-a781-4aaae0ce52c4`
- Subscriptions: none
- Invoices: none
- Charges: none
- Payment intents: none

Checkout sessions on `cus_UUenJcxROxCv3Y`:

- 2026-05-10: Small credit pack, $4.99, expired, unpaid
- 2026-06-03: Medium credit pack, $14.99, expired, unpaid
- 2026-06-03: Small credit pack, $4.99, expired, unpaid
- 2026-06-03: Medium credit pack, $14.99, expired, unpaid

All of these are one-time credit-pack checkout sessions, not subscriptions. None completed payment.

The same live Stripe account cannot retrieve the April ids stored in Supabase:

- Customer `cus_UA4UAQa5KRpCT4`: not found
- Invoice `in_1THUNzLrHNMv3SHuCxGE6EWF`: not found
- Subscription `sub_1THUO1LrHNMv3SHuqxr5hLuK`: not found
- Checkout session `cs_live_a1NR5xj2JVisgsvBh38CMlaIn33vv9JtHYteRtLBG9zX1SReytmF9MfpJq`: not found

Additional current-account checks after Rachel sent screenshots:

- Broad charge search on current live Stripe account for USD $19.00 charges from 2026-04-30 through 2026-05-06: 0 charges.
- Broad charge search on current live Stripe account for USD $19.00 charges from 2026-05-30 through 2026-06-04: 0 charges.
- Google Secret Manager `myimageupscaler-api-prod` enabled versions `22` and `23` both point to current Stripe account `acct_1TPoZG17DctxcZv2`.
- Older Google Secret Manager versions before 2026-04-26 are destroyed, so the previous live Stripe secret cannot be recovered from Secret Manager.
- Local `.env.api` only contains a test-mode Stripe key, not an alternate live key.

### 2026-06-05 Production Stripe Recheck After Rachel's Reply

Rachel replied that TD confirms the May and June card transactions are posted, she does not see Stripe receipt/invoice IDs for May or June in her account, and the expected 200 credits for each month were not added. She again asked for refunds for both transactions. The account email is `rjpasuta@hotmail.com`.

Rechecked Google Secret Manager and current production Stripe on 2026-06-05:

- Used `myimageupscaler-api-prod` from Google Secret Manager via the documented `gcloud-secrets` workflow.
- Enabled secret versions `22`, `23`, and `latest` all point to Stripe account `acct_1TPoZG17DctxcZv2`.
- Account details remain:
  - Account email: `admin@coldstartlabs.ca`
  - Business profile name: `MyImageUpscaler`
  - Dashboard display name: `myimageupscaler.com`
  - Country: `CA`
  - Default currency: `cad`
- Searching current Stripe by `rjpasuta@hotmail.com` still returns only customer `cus_UUenJcxROxCv3Y`.
- Current customer `cus_UUenJcxROxCv3Y` still has:
  - 0 subscriptions
  - 0 invoices
  - 0 payment intents
  - 0 charges
  - 0 saved card payment methods
- Direct retrieval with the current production key still cannot find the April Stripe IDs stored in Supabase:
  - `cus_UA4UAQa5KRpCT4`: not found
  - `in_1THUNzLrHNMv3SHuCxGE6EWF`: not found
  - `sub_1THUO1LrHNMv3SHuqxr5hLuK`: not found
  - `cs_live_a1NR5xj2JVisgsvBh38CMlaIn33vv9JtHYteRtLBG9zX1SReytmF9MfpJq`: not found
- Narrow charge search in current Stripe for USD $19.00 from 2026-05-01 through 2026-05-04 found 0 charges.
- Narrow charge search in current Stripe for USD $19.00 from 2026-06-01 through 2026-06-04 found 0 charges.
- Broader current-account searches for all USD charges in those same windows found other customers' charges only; none matched Rachel's email or card ending `9637`.
- Current-account last-4 search for card ending `9637` returned 0 charges.

Conclusion from recheck: Rachel's screenshots remain credible evidence of posted USD $19.00 May and June charges, but the current production Stripe account still cannot see or refund them. The missing receipts/credits are consistent with the earlier interpretation: the subscription likely continued billing in the older Stripe account/key lineage that produced the April Supabase webhook data, while the app is now connected to `acct_1TPoZG17DctxcZv2`.

### Legacy Personal Stripe Account Findings

Legacy Stripe account checked on 2026-06-05:

- Account id: `acct_1SpEEtLrHNMv3SHu`
- Account email: `joaopaulofurtado@live.com`
- Business profile name: `myimageupscaler.com`
- Dashboard display name: `myimageupscaler.com`
- Country: `CA`
- Default currency: `cad`

Rachel exists in this legacy account as:

- Customer id: `cus_UA4UAQa5KRpCT4`
- Email: `rjpasuta@hotmail.com`
- Metadata: `supabase_user_id=5e5c008b-14fd-4b1d-a781-4aaae0ce52c4`
- Invoice prefix: `HWC0U8XV`

Legacy subscription:

- Subscription id: `sub_1THUO1LrHNMv3SHuqxr5hLuK`
- Status: `active`
- Created/start date: 2026-04-01 19:25:07 UTC
- Price id: `price_1SpFABLrHNMv3SHuTF4yrF9D`
- Price: USD $19.00/month
- Latest invoice: `in_1TdbSiLrHNMv3SHurW7xlTPt`
- Subscription item current period: 2026-06-01 19:25:07 UTC to 2026-07-01 19:25:07 UTC
- Not canceled: `cancel_at_period_end=false`, `canceled_at=null`, `ended_at=null`

Successful legacy charges for Rachel:

- April charge:
  - Charge id: `ch_3THUNzLrHNMv3SHu0ovGLrSE`
  - Payment intent: `pi_3THUNzLrHNMv3SHu0nI5rTGv`
  - Created: 2026-04-01 19:25:08 UTC / 2026-04-01 12:25:08 PDT
  - Amount: USD $19.00
  - Card: Visa ending `9637`
  - Status: succeeded
  - Refunded: false
  - Invoice id: `in_1THUNzLrHNMv3SHuCxGE6EWF`
  - Invoice number: `HWC0U8XV-0001`
- May charge:
  - Charge id: `ch_3TSNdbLrHNMv3SHu2Cv0ioCA`
  - Payment intent: `pi_3TSNdbLrHNMv3SHu2fUDhhRe`
  - Created: 2026-05-01 20:26:17 UTC / 2026-05-01 13:26:17 PDT
  - Amount: USD $19.00
  - Card: Visa ending `9637`
  - Status: succeeded
  - Refunded: false
  - Existing refunds: none
  - Invoice id: `in_1TSMh8LrHNMv3SHu9412jXDI`
  - Invoice number: `HWC0U8XV-0002`
- June charge:
  - Charge id: `ch_3TdcPVLrHNMv3SHu0kAzZIYk`
  - Payment intent: `pi_3TdcPVLrHNMv3SHu0LEVL1zW`
  - Created: 2026-06-01 20:26:11 UTC / 2026-06-01 13:26:11 PDT
  - Amount: USD $19.00
  - Card: Visa ending `9637`
  - Status: succeeded
  - Refunded: false
  - Existing refunds: none
  - Invoice id: `in_1TdbSiLrHNMv3SHurW7xlTPt`
  - Invoice number: `HWC0U8XV-0003`

The May and June legacy charges match Rachel's TD screenshots:

- May TD transaction date 2026-05-01, posted date 2026-05-04, USD $19.00 converted to CAD $26.67, card ending `9637`.
- June TD transaction date 2026-06-01, posted date 2026-06-02, USD $19.00 converted to CAD $26.94, card ending `9637`.

## Interpretation

Rachel's current app account is canceled. The current corporation Stripe account has no active subscription and no successful May or June payment for her.

Her claim of missing 400 credits is valid relative to the legacy charges: the legacy personal Stripe account billed her USD $19.00 in May and USD $19.00 in June, but the app/Supabase integration was already connected to the corporation Stripe account and did not process those legacy renewal webhooks. No May/June credits were granted in Supabase.

The cause is now confirmed: Rachel's subscription continued billing in the legacy personal Stripe account while the app/Supabase/current Stripe integration no longer had access to that subscription state. The legacy subscription has now been canceled and the May/June charges have been refunded.

## Resolution Actions Completed

Completed in legacy Stripe account `acct_1SpEEtLrHNMv3SHu` on 2026-06-05:

- Canceled Rachel's legacy subscription `sub_1THUO1LrHNMv3SHuqxr5hLuK`.
  - Final status: `canceled`
  - Canceled at: 2026-06-05 16:34:59 UTC / 2026-06-05 09:34:59 PDT
  - Rachel now has 0 active subscriptions in the legacy Stripe account.
- Refunded May charge `ch_3TSNdbLrHNMv3SHu2Cv0ioCA`.
  - Refund id: `re_3TSNdbLrHNMv3SHu2ksaq4Os`
  - Amount: USD $19.00
  - Status: `succeeded`
  - Created: 2026-06-05 16:34:41 UTC
- Refunded June charge `ch_3TdcPVLrHNMv3SHu0kAzZIYk`.
  - Refund id: `re_3TdcPVLrHNMv3SHu0ykmXaCQ`
  - Amount: USD $19.00
  - Status: `succeeded`
  - Created: 2026-06-05 16:34:42 UTC

Follow-up from legacy-account sweep:

- There is one remaining active subscription in the legacy personal Stripe account for another customer:
  - Customer: `wayneburr@msn.com`
  - Customer id: `cus_Tzu8iKRF1H9fEV`
  - Supabase user id: `22aa701f-5acd-4529-ae0c-2b3909c2ddfa`
  - Subscription id: `sub_1T1uL0LrHNMv3SHu8xb48mup`
  - Price: USD $9.00/month
  - This was not modified during Rachel's refund/cancel work.

## Recommended Support Action

1. Acknowledge Rachel's screenshots and confirm they show two posted card transactions from MyImageUpscaler.
2. Tell Rachel her current app account is canceled and no active subscription exists in the current billing account.
3. Explain that the screenshots do not appear in the current corporation Stripe account because the charges were on the older personal Stripe account that handled her April subscription.
4. Do not ask Rachel again for last 4/card details; she already provided card ending `9637`, dates, posted dates, and converted amounts.
5. Completed: canceled legacy subscription `sub_1THUO1LrHNMv3SHuqxr5hLuK` in legacy Stripe account `acct_1SpEEtLrHNMv3SHu`.
6. Completed: refunded the May and June charges from the legacy Stripe account:
   - May: refund `re_3TSNdbLrHNMv3SHu2ksaq4Os` for charge `ch_3TSNdbLrHNMv3SHu2Cv0ioCA`, USD $19.00.
   - June: refund `re_3TdcPVLrHNMv3SHu0ykmXaCQ` for charge `ch_3TdcPVLrHNMv3SHu0kAzZIYk`, USD $19.00.
7. Do not issue a May/June refund from the current corporation Stripe account because there are no May/June charges there.

## Draft Reply Email

Subject: Re: I was charged for a 3rd time

Hi Rachel,

Thanks for sending the screenshots. I can see the two posted card transactions from MyImageUpscaler: one for May 1, 2026 and one for June 1, 2026, both originally USD $19.00 and converted by TD to CAD.

I checked your app account again and confirmed your subscription is currently canceled on our side. I also checked the current billing account connected to the app, and those May/June charges are not showing there, which explains why you do not see matching receipts or the 200-credit monthly grants in your account.

We found the issue: your original April subscription was processed through an older billing account connection. That older billing account continued charging the card ending 9637 on May 1 and June 1, but those renewals did not sync back into your app account after our billing system moved to the current account.

I located both posted transactions, canceled the older billing subscription, and issued refunds for the May and June charges. Refunds usually take several business days to appear on the card, depending on the bank.

Best,  
Support
