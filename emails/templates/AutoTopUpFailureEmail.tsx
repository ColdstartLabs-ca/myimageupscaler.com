import React from 'react';
import { Html, Head, Body, Container, Section, Text, Button } from '@react-email/components';

interface IAutoTopUpFailureEmailProps {
  baseUrl: string;
  appName?: string;
  paused?: boolean;
}

export function AutoTopUpFailureEmail({
  baseUrl,
  appName = 'MyImageUpscaler',
  paused = false,
}: IAutoTopUpFailureEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ margin: '0 auto', maxWidth: '560px', padding: '32px 20px' }}>
          <Section>
            <Text style={{ fontSize: '24px', fontWeight: 700 }}>Auto top-up did not complete</Text>
            <Text style={{ fontSize: '16px', lineHeight: '24px' }}>
              Your credits were not changed and your payment method may need attention.
              {paused ? ' Auto top-up has been paused after repeated failures.' : ''}
            </Text>
            <Button href={`${baseUrl}/dashboard/billing`} style={{ padding: '12px 20px' }}>
              Review billing settings
            </Button>
            <Text style={{ fontSize: '13px' }}>{appName}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
