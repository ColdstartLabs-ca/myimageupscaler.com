import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    BREVO_API_KEY: 'secret-brevo-key',
    CLOUDFLARE_EMAIL_API_TOKEN: 'secret-cloudflare-token',
    CLOUDFLARE_ZONE_ID: 'secret-zone-id',
    CRON_SECRET: 'secret-cron-value',
    BASE_URL: 'https://example.com',
    EMAIL_FROM_ADDRESS: 'noreply@example.com',
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: {} }));

import {
  assertBrevoAuthentication,
  assertBrevoSenderReadiness,
  assertQueueDistribution,
  assertCronReadinessResponse,
  assertProductionBaseUrl,
  formatReadinessSummary,
  summarizeBrevoAccount,
} from '@/scripts/check-email-delivery-readiness';

describe('check-email-delivery-readiness helpers', () => {
  it('should fail when production Brevo authentication is not HTTP 200', () => {
    expect(() => assertBrevoAuthentication(401)).toThrow('HTTP 401');
    expect(() => assertBrevoAuthentication(200)).not.toThrow();
  });
  it('should report only Brevo plan capacity and not account identity', () => {
    const account = summarizeBrevoAccount({
      email: 'owner@example.com',
      companyName: 'Secret Company',
      plan: [{ type: 'free', credits: 300, creditsType: 'sendLimit' }],
    });
    expect(account).toEqual({ planType: 'free', dailyLimit: 300 });
    expect(JSON.stringify(account)).not.toContain('owner@example.com');
    expect(JSON.stringify(account)).not.toContain('Secret Company');
  });

  it('should fail unless the configured Brevo sender and domain are verified', () => {
    expect(() =>
      assertBrevoSenderReadiness({ senders: [] }, { domains: [] }, 'noreply@example.com')
    ).toThrow('sender and domain');
    expect(
      assertBrevoSenderReadiness(
        { senders: [{ email: 'noreply@example.com', active: true }] },
        {
          domains: [{ domain_name: 'example.com', authenticated: true, verified: true }],
        },
        'noreply@example.com'
      )
    ).toEqual({ senderVerified: true, domainAuthenticated: true });
  });

  it('should fail when cron dry-run returns an unauthorized or invalid response', () => {
    expect(() => assertCronReadinessResponse({ error: 'Unauthorized' })).toThrow(
      'did not authenticate'
    );
    expect(() =>
      assertCronReadinessResponse({ success: true, dryRun: true, duePending: 10 })
    ).toThrow('current bounded drain contract');
  });

  it('should fail when an unclassified marketing row is returned as due', () => {
    expect(() =>
      assertCronReadinessResponse({
        success: true,
        dryRun: true,
        drainOnly: true,
        sendLimit: 1,
        duePending: 10,
        eligiblePending: 2,
        heldPending: 8,
        unclassifiedPending: 0,
        unclassifiedDueReturned: 1,
      })
    ).toThrow('unclassified marketing rows');
  });

  it('should reject a local or insecure production readiness target', () => {
    expect(() => assertProductionBaseUrl('http://localhost:3000')).toThrow('non-local HTTPS');
    expect(() => assertProductionBaseUrl('http://example.com')).toThrow('non-local HTTPS');
    expect(() => assertProductionBaseUrl('https://example.com')).not.toThrow();
  });

  it('should redact credentials account identity and recipients from output', () => {
    const output = formatReadinessSummary({
      source: 'production',
      brevo: {
        authenticated: true,
        senderVerified: true,
        domainAuthenticated: true,
        planType: 'free',
        dailyLimit: 300,
      },
      cloudflare: { sendingDomainEnabled: true },
      cron: {
        authenticated: true,
        duePending: 10,
        eligiblePending: 2,
        heldPending: 8,
        unclassifiedPending: 0,
        unclassifiedDueReturned: 0,
      },
      queue: {
        pending: 12,
        due: 10,
        byDecision: {
          unclassified: 2,
          protected: 0,
          keep_high: 4,
          keep_medium: 3,
          hold_experiment: 2,
          cancel: 1,
        },
        byValueBand: {
          unclassified: 2,
          protected: 0,
          high: 4,
          medium: 3,
          experiment: 2,
          cancel: 1,
        },
      },
      backupSecretVersions: 2,
    });
    expect(output).not.toContain('secret-brevo-key');
    expect(output).not.toContain('secret-cloudflare-token');
    expect(output).not.toContain('owner@example.com');
    expect(output).toContain('"authenticated":true');
  });

  it('should fail when policy decisions or value bands do not reconcile to pending rows', () => {
    expect(() =>
      assertQueueDistribution(12, { unclassified: 2, keep_high: 4 }, { unclassified: 2, high: 4 })
    ).toThrow('decision distribution');

    expect(() =>
      assertQueueDistribution(12, { unclassified: 2, keep_high: 10 }, { unclassified: 2, high: 9 })
    ).toThrow('value-band distribution');

    expect(() =>
      assertQueueDistribution(12, { unclassified: 2, keep_high: 10 }, { unclassified: 2, high: 10 })
    ).not.toThrow();
  });
});
