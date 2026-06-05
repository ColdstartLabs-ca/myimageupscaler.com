# Rachel Pasuta Billing Resolution Summary

Date: 2026-06-05  
Customer: Rachel Pasuta  
Email: rjpasuta@hotmail.com  
Issue: Customer was charged for May and June after app-side cancellation and did not receive corresponding monthly credits.

## Outcome

Resolved on 2026-06-05.

- Legacy Stripe subscription canceled.
- May 2026 charge refunded.
- June 2026 charge refunded.
- Root cause confirmed as legacy personal Stripe account continuing to bill after production moved to the corporation Stripe account.

## Accounts

Current corporation Stripe account:

- Account id: `acct_1TPoZG17DctxcZv2`
- Rachel customer id: `cus_UUenJcxROxCv3Y`
- Result: no subscriptions, invoices, payment intents, charges, or saved payment methods for Rachel.

Legacy personal Stripe account:

- Account id: `acct_1SpEEtLrHNMv3SHu`
- Rachel customer id: `cus_UA4UAQa5KRpCT4`
- Rachel subscription id: `sub_1THUO1LrHNMv3SHuqxr5hLuK`
- Price: USD $19.00/month
- Card: Visa ending `9637`

## Confirmed Charges

April charge:

- Charge id: `ch_3THUNzLrHNMv3SHu0ovGLrSE`
- Invoice id: `in_1THUNzLrHNMv3SHuCxGE6EWF`
- Invoice number: `HWC0U8XV-0001`
- Amount: USD $19.00
- Status: succeeded
- Refunded: false

May charge:

- Charge id: `ch_3TSNdbLrHNMv3SHu2Cv0ioCA`
- Invoice id: `in_1TSMh8LrHNMv3SHu9412jXDI`
- Invoice number: `HWC0U8XV-0002`
- Amount: USD $19.00
- Status: succeeded
- Refunded: true
- Refund id: `re_3TSNdbLrHNMv3SHu2ksaq4Os`
- Refund status: succeeded

June charge:

- Charge id: `ch_3TdcPVLrHNMv3SHu0kAzZIYk`
- Invoice id: `in_1TdbSiLrHNMv3SHurW7xlTPt`
- Invoice number: `HWC0U8XV-0003`
- Amount: USD $19.00
- Status: succeeded
- Refunded: true
- Refund id: `re_3TdcPVLrHNMv3SHu0ykmXaCQ`
- Refund status: succeeded

## Completed Actions

Legacy subscription canceled:

- Subscription id: `sub_1THUO1LrHNMv3SHuqxr5hLuK`
- Final status: `canceled`
- Canceled at: 2026-06-05 16:34:59 UTC / 2026-06-05 09:34:59 PDT
- Verification: Rachel has 0 active subscriptions in the legacy Stripe account.

Refunds issued:

- May refund `re_3TSNdbLrHNMv3SHu2ksaq4Os`, USD $19.00, succeeded.
- June refund `re_3TdcPVLrHNMv3SHu0ykmXaCQ`, USD $19.00, succeeded.

## Root Cause

Rachel's April subscription was created in the legacy personal Stripe account. The app later moved to the corporation Stripe account, and Supabase/app billing state showed Rachel as canceled. However, the legacy Stripe subscription remained active and continued billing May and June renewals.

Those May and June renewal charges did not sync into Supabase, so Rachel did not receive the expected 200 subscription credits for either month and did not see matching current-account Stripe receipt/invoice IDs in the app.

## Customer Reply

Subject: Re: I was charged for a 3rd time

Hi Rachel,

Thank you for sending the screenshots. I confirmed the two posted MyImageUpscaler card transactions: one from May 1, 2026 and one from June 1, 2026, both originally USD $19.00 and converted by TD to CAD.

I found the issue. Your original April subscription was processed through an older billing account connection. Although your app account showed the subscription as canceled, that older billing account continued charging the card ending 9637 on May 1 and June 1. Those renewal payments did not sync back into your app account, which is why you did not see matching receipts or the 200-credit monthly grants.

I have now canceled the older billing subscription and issued refunds for both the May and June charges. Refunds typically take 5-10 business days to appear on the card, depending on the bank.

I am sorry for the trouble here, and thank you for sending the card screenshots so we could trace the payments.

Best,  
Support

Optional attachment note:

- It is okay to attach a cropped Stripe screenshot showing only Rachel's two refunded rows.
- The screenshot may show the May 1 and June 1 charges, card ending `9637`, Rachel's email, and `Refunded` status.
- Do not include other customers' rows or internal account details.
- Suggested line if attaching it: "I have attached a screenshot from our billing system showing both May 1 and June 1 charges marked as refunded. The refunds were issued on June 5."

## Follow-Up

- Rotate the legacy Stripe live key that was used during this investigation.
- Review the remaining active legacy subscription:
  - Customer: `wayneburr@msn.com`
  - Customer id: `cus_Tzu8iKRF1H9fEV`
  - Supabase user id: `22aa701f-5acd-4529-ae0c-2b3909c2ddfa`
  - Subscription id: `sub_1T1uL0LrHNMv3SHu8xb48mup`
  - Price: USD $9.00/month
