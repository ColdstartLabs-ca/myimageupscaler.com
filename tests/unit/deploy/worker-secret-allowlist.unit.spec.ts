import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Server-side `process.env` is a RUNTIME lookup on the Cloudflare Worker.
 *
 * Next.js only inlines `NEXT_PUBLIC_*` at build time, so any other server variable
 * is empty in production unless `scripts/deploy/steps/05-secrets.sh` uploads it as a
 * Worker secret. The failure is silent: `serverEnv.X` resolves to its zod default
 * (usually `''`) and the feature reading it degrades without an error.
 *
 * This is not hypothetical. `BLOG_API_KEY` was present in the production secret but
 * missing from the allowlist, so every authenticated blog admin route answered
 * `500 INTERNAL_ERROR "Server configuration error"`. `GA4_API_SECRET` was missing the
 * same way, and `trackGA4ServerEvent` returns early without it — dropping every
 * server-side GA4 conversion, including Stripe purchases, with no log line.
 *
 * `AMPLITUDE_API_KEY` survived only because it falls back to its `NEXT_PUBLIC_` twin;
 * see `tests/unit/config/amplitude-env-fallback.unit.spec.ts`.
 */
const SECRETS_STEP = 'scripts/deploy/steps/05-secrets.sh';

/**
 * Runtime-consumed server variables with no `NEXT_PUBLIC_` fallback and no usable
 * default. Each must reach the Worker, so each must be in the allowlist.
 */
const REQUIRED_AT_RUNTIME: { name: string; consumer: string }[] = [
  { name: 'SUPABASE_SERVICE_ROLE_KEY', consumer: 'server/supabase/supabaseAdmin.ts' },
  { name: 'STRIPE_SECRET_KEY', consumer: 'app/api/checkout/route.ts' },
  { name: 'STRIPE_WEBHOOK_SECRET', consumer: 'app/api/webhooks/stripe/route.ts' },
  { name: 'REPLICATE_API_TOKEN', consumer: 'server/services/replicate.service.ts' },
  { name: 'GEMINI_API_KEY', consumer: 'server/services/image-generation.service.ts' },
  { name: 'BREVO_API_KEY', consumer: 'server/services/email-providers' },
  { name: 'CRON_SECRET', consumer: 'app/api/cron/*' },
  { name: 'BLOG_API_KEY', consumer: 'lib/middleware/blogApiAuth.ts' },
  { name: 'GA4_API_SECRET', consumer: 'server/analytics/analyticsService.ts' },
  { name: 'AMPLITUDE_SECRET_KEY', consumer: 'server/services/amplitude-cohort.service.ts' },
  { name: 'INDEXNOW_KEY', consumer: 'lib/seo/indexnow.ts' },
  { name: 'GSC_PRIVATE_KEY', consumer: 'app/api/cron/refresh-3kings-sitemap/route.ts' },
  { name: 'GSC_SERVICE_ACCOUNT_EMAIL', consumer: 'app/api/cron/refresh-3kings-sitemap/route.ts' },
  { name: 'GSC_SITE_URL', consumer: 'app/api/cron/refresh-3kings-sitemap/route.ts' },
  { name: 'OUTRANK_WEBHOOK_SECRET', consumer: 'app/api/webhooks/outrank/route.ts' },
  { name: 'OPENROUTER_API_KEY', consumer: 'server/services/openrouter.service.ts' },
  { name: 'CLOUDFLARE_API_TOKEN', consumer: 'server/services/cloudflareImages.service.ts' },
  {
    name: 'STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID',
    consumer: 'server/services/engagement-discount.service.ts',
  },
];

/**
 * Deploy-machine-only credentials. The Worker must never receive these, so they are
 * deliberately absent from the allowlist — see `.claude/skills/gcloud-secrets`.
 */
const DEPLOY_ONLY = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

function allowlistedNames(script: string): string[] {
  const block = script.match(/local secrets=\(([\s\S]*?)\)/);
  const fromArray = block ? block[1].split('\n').map(line => line.trim()) : [];
  const publicVars = script.match(/for var in ([A-Z_0-9 ]+); do/);
  const fromLoop = publicVars ? publicVars[1].trim().split(/\s+/) : [];

  return [...fromArray, ...fromLoop].filter(name => /^[A-Z][A-Z_0-9]*$/.test(name));
}

describe('Worker secret allowlist', () => {
  const script = readFileSync(SECRETS_STEP, 'utf8');
  const allowlisted = allowlistedNames(script);

  it('parses the allowlist out of the deploy step', () => {
    expect(allowlisted.length).toBeGreaterThan(10);
    expect(allowlisted).toContain('STRIPE_SECRET_KEY');
    expect(allowlisted).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it.each(REQUIRED_AT_RUNTIME)(
    'uploads $name to the Worker (read at runtime by $consumer)',
    ({ name }) => {
      expect(allowlisted).toContain(name);
    }
  );

  it('never uploads deploy-machine-only credentials to the Worker', () => {
    for (const name of DEPLOY_ONLY) {
      expect(allowlisted).not.toContain(name);
    }
  });
});
