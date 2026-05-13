---
name: organic-funnel-attribution-repair-technique
description: Diagnose and repair SEO/organic attribution loss across GA4, auth callbacks, dashboard redirects, Stripe checkout, signup/upload/upscale/checkout/purchase events, source/medium/session preservation, and Unassigned conversions. Use when organic conversions, GA4 attribution, source/medium continuity, or funnel events appear missing, misclassified, self-referred, direct, referral, or Unassigned.
---

# Organic Funnel Attribution Repair Technique

Use this skill to find where organic acquisition context is lost between SEO landing pages, account creation, product usage, checkout, and purchase confirmation. Prefer evidence from GA4, server/client event logs, URL redirects, cookies/local storage, and code paths. Do not edit app code unless the user explicitly asks; produce a diagnosis, repair plan, and validation checklist.

## Project Quick Run

For this repo, start with GA4 and synthesized SEO output:

```bash
node ./.claude/skills/ga-analysis/scripts/ga-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/ga-miu.json
node ./.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs --site=myimageupscaler.com --days=28 --output=/tmp/gsc-miu.json
node ./.claude/skills/seo-growth-plan/scripts/seo-synthesize.cjs \
  --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --site=myimageupscaler.com \
  --output=/tmp/seo-plan-miu.json
```

Read `summary.ga`, `sourceMedium`, `opportunities.highTrafficLowConversion`, and `opportunities.trackingGaps` from those files. A high-priority symptom is total conversions under `(not set)` or another non-organic bucket while Organic Search has engaged sessions and zero conversions.

## Inputs

Ask for the smallest useful set:

- GA4 date range, comparison range, property/stream, and key events.
- Funnel events: `sign_up`, `login`, `image_upload`, `upscale_started`, `upscale_completed`, `checkout_started`, `purchase`, plus any local equivalents from `docs/technical/systems/analytics.md`.
- Organic landing pages, `session_source`, `session_medium`, `first_user_source`, `first_user_medium`, channel group, transaction ID, revenue, and page referrer.
- Redirect map for SEO page -> auth callback -> dashboard/upload -> pricing/checkout -> success.
- Stripe Checkout and webhook event payload fields that can carry attribution IDs, user IDs, session IDs, client reference IDs, or metadata.

If direct GA4 access is unavailable, request a GA4 exploration/export by landing page, event name, source/medium, session default channel group, user ID or pseudonymous ID if allowed, transaction ID, and checkout/session path.

## Diagnosis Workflow

1. Establish the expected path for organic visitors: landing page, signup or login, dashboard redirect, upload, upscale, checkout, purchase.
2. Compare organic landing-page sessions with downstream event counts and conversion counts by the same date range.
3. Locate the first attribution break: missing event, changed source/medium, new session, domain referral, direct session, missing user stitching, or purchase arriving only from webhook.
4. Check redirects and callbacks for dropped query parameters, missing referrer, cookie scope changes, cross-domain linker gaps, and server-side redirects that start fresh sessions.
5. Check Stripe handoff for missing `client_reference_id`, missing user/customer mapping, missing transaction ID consistency, and purchase events that lack original acquisition context.
6. Review consent behavior: denied or delayed consent can explain missing client-side events, but should not create inconsistent server-side purchase attribution without a documented fallback.
7. Quantify impact: affected events, lost organic conversions, Unassigned share, Direct/referral inflation, revenue affected, and start date of regression.

## Common Failure Modes

- Auth callback or dashboard redirect strips `utm_*`, `gclid`, landing page, referrer, or anonymous/session IDs before signup.
- User identity changes at signup/login without linking anonymous pre-auth events to the authenticated user.
- Upload/upscale events fire in Amplitude or app logs but not GA4, causing GA4 to see a purchase without prior funnel context.
- Stripe Checkout uses a Stripe-hosted domain without linker/correlation metadata, so return or webhook purchase events are attributed to referral, direct, or Unassigned.
- Server-side purchase events omit GA4 `client_id`/`session_id`, transaction ID, source/medium, or original landing page.
- Internal redirects create a new session or referral from the app domain.
- GA4 channel grouping classifies events as Unassigned because source/medium values are blank, custom, malformed, or sent only on later events.
- Event names or parameters differ across signup, upload, upscale, checkout, and purchase, preventing funnel reconstruction.

## MyImageUpscaler Red Flags

Escalate attribution repair when any of these appear:

- `sourceMedium` contains `(not set)` conversions while `google / organic` has zero conversions.
- `/auth/callback`, `/dashboard`, or localized dashboard/callback pages dominate organic landing-page sessions.
- `opportunities.trackingGaps.gaGhosts` includes auth or dashboard URLs.
- Total conversions are nonzero, but `summary.organic.current.conversions` is zero.
- Product events exist in Amplitude/server analytics but GA4 Organic Search does not receive matching key events.

## Repair Plan Pattern

For each break, specify:

- Evidence: exact report/export/log finding and affected path.
- Root cause: what identifier, parameter, event, or redirect behavior is losing attribution.
- Fix owner: analytics config, app client, app server, auth, Stripe checkout, webhook, or GA4 admin.
- Repair: preserve or persist acquisition context, stitch anonymous/authenticated IDs, pass GA4 client/session identifiers through checkout metadata, normalize event names/params, exclude payment/referral domains, or correct channel grouping.
- Backfill: whether historical GA4 data can be fixed, whether warehouse data can be repaired, and what cannot be recovered.
- Validation: specific event path and GA4/warehouse report that should change.

When local code context matters, inspect `docs/technical/systems/analytics.md` for existing event names and client/server tracking patterns. For SEO performance framing, use `google-analytics-seo-analysis`.

## Validation Checklist

- Organic landing page session keeps source/medium through signup/login and dashboard redirect.
- Upload and upscale events contain the same user/session correlation expected for the original organic visit.
- Checkout start includes plan, entry point, user/customer ID, and preserved attribution context.
- Stripe checkout/session/webhook can map purchase back to the user, original session or client ID, transaction ID, and landing page.
- Purchase revenue appears under Organic Search when the user journey began organically.
- Unassigned conversions decline without artificially overwriting legitimate Direct, Paid, Referral, or Email traffic.
- Payment processor and app domains are excluded or handled so they do not become conversion referrers.

## Output

```markdown
# Organic Funnel Attribution Repair

**Period**: [date range]
**Primary symptom**: [Unassigned/direct/referral/missing conversions]

## Finding

[First confirmed attribution break and affected funnel step]

## Impact

[Lost/misclassified conversions, revenue, event counts, and affected pages]

## Root Cause

[Identifier, redirect, event, GA4, auth, or Stripe issue]

## Repair Plan

1. [highest leverage fix]
2. [next fix]
3. [GA4/admin or reporting fix]

## Validation

[exact test journey and reports/logs to verify]

## Residual Risk

[data that cannot be recovered or assumptions needing confirmation]
```
