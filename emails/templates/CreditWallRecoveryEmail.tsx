import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Link,
} from '@react-email/components';

interface ICreditWallRecoveryEmailProps {
  userName?: string;
  ctaUrl?: string;
  preferenceUrl?: string;
  recoveryAudience?: 'credit_wall_dismissed' | 'high_usage_free_user';
  creditsRemaining?: number;
  freeUsageCount?: number;
  baseUrl: string;
  supportEmail: string;
  appName?: string;
}

export function CreditWallRecoveryEmail({
  userName = 'there',
  ctaUrl,
  preferenceUrl,
  recoveryAudience = 'credit_wall_dismissed',
  creditsRemaining,
  freeUsageCount,
  baseUrl,
  supportEmail,
  appName = 'MyImageUpscaler',
}: ICreditWallRecoveryEmailProps): React.JSX.Element {
  const isHighUsage = recoveryAudience === 'high_usage_free_user';
  const finalCtaUrl =
    ctaUrl || `${baseUrl}/pricing?recovery=${isHighUsage ? 'free-limit' : 'credit-wall'}`;
  const heading = isHighUsage
    ? 'You are close to your free upscale limit'
    : 'Finish more images without stopping';
  const bodyCopy = isHighUsage
    ? 'You have been getting value from your free upscales. A paid plan keeps higher quality workflows available when your free credits run out.'
    : 'You can keep your image workflow moving with credits ready before the next export.';
  const usageLine =
    creditsRemaining !== undefined
      ? `Current credits remaining: ${Math.max(creditsRemaining, 0)}.`
      : freeUsageCount !== undefined
        ? `Free upscales used: ${freeUsageCount}.`
        : null;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>

          <Section style={content}>
            <Text style={headingStyle}>{heading}</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>{bodyCopy}</Text>
            {usageLine && <Text style={note}>{usageLine}</Text>}
            <Button href={finalCtaUrl} style={button}>
              See options
            </Button>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              Questions?{' '}
              <Link href={`mailto:${supportEmail}`} style={footerLink}>
                Contact us
              </Link>
            </Text>
            {preferenceUrl && (
              <Text style={footerText}>
                <Link href={preferenceUrl} style={footerLink}>
                  Manage email preferences
                </Link>
              </Text>
            )}
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
};

const header = {
  backgroundColor: '#1f2937',
  padding: '24px',
  textAlign: 'center' as const,
};

const logo = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
};

const content = {
  padding: '32px 24px',
};

const headingStyle = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '16px',
};

const note = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#64748b',
  marginBottom: '20px',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '0',
};

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '14px',
  color: '#64748b',
  margin: '4px 0',
};

const footerLink = {
  color: '#2563eb',
  textDecoration: 'underline',
};
