import React from 'react';
import { Body, Container, Head, Html, Section, Text } from '@react-email/components';

interface IQuotaAlertItem {
  resource: string;
  utilizationPercent: number;
  currentBytes: number | null;
  budgetBytes: number;
  growthBytesPerDay: number | null;
  daysLeft: number | null;
}

interface IQuotaGuardAlertEmailProps {
  appName?: string;
  day: string;
  thresholdPercent: number;
  alerts: IQuotaAlertItem[];
  staleCronJobs?: string[];
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unmeasured';
  return `${(bytes / 1_000_000_000).toFixed(2)} GB (${bytes.toLocaleString('en-US')} bytes)`;
}

export function QuotaGuardAlertEmail({
  appName = 'MyImageUpscaler',
  day,
  thresholdPercent,
  alerts,
  staleCronJobs = [],
}: IQuotaGuardAlertEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ margin: '0 auto', maxWidth: '560px', padding: '32px 20px' }}>
          <Section>
            <Text style={{ fontSize: '24px', fontWeight: 700 }}>
              {appName} storage quota alert
            </Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              On {day}, {alerts.length} resource{alerts.length === 1 ? '' : 's'} reached{' '}
              {thresholdPercent}% or more of the MIU Free-plan budget.
            </Text>
            {staleCronJobs.length > 0 && (
              <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
                <strong>Stale cron jobs</strong>: {staleCronJobs.join(', ')}. Their last
                successful run is older than the freshness window. The deploy gate sees HTTP
                200 for a degraded health body, so this email is the alert path.
              </Text>
            )}
            {alerts.map(alert => (
              <Text key={alert.resource} style={{ fontSize: '16px', lineHeight: '24px' }}>
                <strong>{alert.resource}</strong>: {alert.utilizationPercent}% of budget. Current{' '}
                {formatBytes(alert.currentBytes)} of {formatBytes(alert.budgetBytes)}.{' '}
                {alert.growthBytesPerDay === null
                  ? 'Growth rate unavailable.'
                  : `Growing ${Math.round(alert.growthBytesPerDay).toLocaleString('en-US')} bytes/day.`}{' '}
                {alert.daysLeft === null
                  ? 'Runway unavailable.'
                  : `About ${alert.daysLeft} days left at this rate.`}
              </Text>
            ))}
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              An alert is the trigger to tighten retention, not to upgrade.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
