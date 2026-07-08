import React from 'react';
import { render } from '@react-email/render';
import { pathToFileURL } from 'url';
import { CheckoutRecoveryEmail } from '@/emails/templates/CheckoutRecoveryEmail';
import { CreditWallRecoveryEmail } from '@/emails/templates/CreditWallRecoveryEmail';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';
import { serverEnv } from '@shared/config/env';

interface IRecoveryEmailSmokeCase {
  label: string;
  queueId: string;
  destination: string;
  render: (ctaUrl: string) => React.JSX.Element;
}

export interface IRecoveryEmailSmokeResult {
  label: string;
  destination: string;
  clickUrl: string;
  htmlLength: number;
  containsClickUrl: boolean;
  containsRawTokenWord: boolean;
}

export function buildLifecycleClickUrl(params: {
  service: Pick<EmailLifecycleService, 'createClickToken'>;
  queueId: string;
  destination: string;
}): string {
  const token = params.service.createClickToken(params.queueId, params.destination);
  return `/api/email/click?q=${encodeURIComponent(params.queueId)}&url=${encodeURIComponent(
    params.destination
  )}&token=${token}`;
}

export async function smokeRecoveryEmailCase(
  smokeCase: IRecoveryEmailSmokeCase,
  service: Pick<EmailLifecycleService, 'createClickToken'>
): Promise<IRecoveryEmailSmokeResult> {
  const clickUrl = buildLifecycleClickUrl({
    service,
    queueId: smokeCase.queueId,
    destination: smokeCase.destination,
  });
  const html = await render(smokeCase.render(clickUrl));

  return {
    label: smokeCase.label,
    destination: smokeCase.destination,
    clickUrl,
    htmlLength: html.length,
    containsClickUrl: html.includes('/api/email/click'),
    containsRawTokenWord: html.includes('raw_token') || html.includes('recovery_token'),
  };
}

function getSmokeCases(): IRecoveryEmailSmokeCase[] {
  const baseProps = {
    baseUrl: serverEnv.BASE_URL,
    supportEmail: serverEnv.SUPPORT_EMAIL,
    appName: serverEnv.APP_NAME,
    preferenceUrl: '/dashboard/settings',
    userName: 'Test User',
  };

  return [
    {
      label: 'checkout recovery',
      queueId: 'smoke_checkout_recovery',
      destination: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
      render: ctaUrl =>
        React.createElement(CheckoutRecoveryEmail, {
          ...baseProps,
          ctaUrl,
          recoveryAudience: 'checkout_abandoner',
        }),
    },
    {
      label: 'upgrade recovery',
      queueId: 'smoke_upgrade_recovery',
      destination:
        '/pricing?intent=upgrade_click_no_purchase&recovery=upgrade-click&trigger=upgrade_prompt&selected=pro',
      render: ctaUrl =>
        React.createElement(CheckoutRecoveryEmail, {
          ...baseProps,
          ctaUrl,
          recoveryAudience: 'upgrade_click_no_purchase',
          trigger: 'upgrade_prompt',
        }),
    },
    {
      label: 'credit wall recovery',
      queueId: 'smoke_credit_wall_recovery',
      destination:
        '/pricing?intent=credit_wall_dismissed&recovery=credit-wall&trigger=insufficient_credits',
      render: ctaUrl =>
        React.createElement(CreditWallRecoveryEmail, {
          ...baseProps,
          ctaUrl,
          recoveryAudience: 'credit_wall_dismissed',
          creditsRemaining: 0,
        }),
    },
    {
      label: 'high usage free recovery',
      queueId: 'smoke_high_usage_recovery',
      destination: '/pricing?intent=high_usage_free_user&recovery=free-limit',
      render: ctaUrl =>
        React.createElement(CreditWallRecoveryEmail, {
          ...baseProps,
          ctaUrl,
          recoveryAudience: 'high_usage_free_user',
          freeUsageCount: 4,
        }),
    },
  ];
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(`Usage: npx tsx scripts/smoke-recovery-emails.ts

Locally renders all recovery email templates with signed lifecycle click URLs.
No email provider is called and no email is sent.
`);
    return;
  }

  const service = new EmailLifecycleService();
  const results = await Promise.all(
    getSmokeCases().map(smokeCase => smokeRecoveryEmailCase(smokeCase, service))
  );

  for (const result of results) {
    const status =
      result.containsClickUrl && !result.containsRawTokenWord && result.htmlLength > 500
        ? 'OK'
        : 'FAIL';
    console.log(
      `${status} ${result.label}: htmlLength=${result.htmlLength} | clickRoute=${result.containsClickUrl} | rawTokenLeak=${result.containsRawTokenWord}`
    );
  }

  const failed = results.filter(
    result => !result.containsClickUrl || result.containsRawTokenWord || result.htmlLength <= 500
  );
  if (failed.length > 0) {
    throw new Error(
      `Recovery email smoke failed for: ${failed.map(result => result.label).join(', ')}`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
