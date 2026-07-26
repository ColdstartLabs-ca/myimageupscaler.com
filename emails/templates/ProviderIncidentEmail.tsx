import React from 'react';
import { Body, Container, Head, Html, Section, Text } from '@react-email/components';

interface IProviderIncidentEmailProps {
  appName?: string;
  attempts: number;
  failures: number;
  failureRatioPercent: number;
  billingFailures: number;
  circuitStatus: string;
}

export function ProviderIncidentEmail({
  appName = 'MyImageUpscaler',
  attempts,
  failures,
  failureRatioPercent,
  billingFailures,
  circuitStatus,
}: IProviderIncidentEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ margin: '0 auto', maxWidth: '560px', padding: '32px 20px' }}>
          <Section>
            <Text style={{ fontSize: '24px', fontWeight: 700 }}>
              Image processing provider incident
            </Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              {failures} of {attempts} processing attempts failed in the last 10 minutes (
              {failureRatioPercent}%).
            </Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              Circuit status: {circuitStatus}. Billing-related failures: {billingFailures}.
            </Text>
            {billingFailures > 0 && (
              <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
                Check provider prepaid balance, auto-reload, and billing status immediately.
              </Text>
            )}
            <Text style={{ fontSize: '13px' }}>{appName}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
