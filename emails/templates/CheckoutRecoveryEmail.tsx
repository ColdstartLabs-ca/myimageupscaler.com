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

interface ICheckoutRecoveryEmailProps {
  userName?: string;
  ctaUrl?: string;
  preferenceUrl?: string;
  recoveryAudience?: 'checkout_abandoner' | 'upgrade_click_no_purchase';
  trigger?: string;
  baseUrl: string;
  supportEmail: string;
  appName?: string;
}

export function CheckoutRecoveryEmail({
  userName = 'there',
  ctaUrl,
  preferenceUrl,
  recoveryAudience = 'checkout_abandoner',
  trigger,
  baseUrl,
  supportEmail,
  appName = 'MyImageUpscaler',
}: ICheckoutRecoveryEmailProps): React.JSX.Element {
  const isUpgradeClick = recoveryAudience === 'upgrade_click_no_purchase';
  const finalCtaUrl =
    ctaUrl ||
    `${baseUrl}/pricing?recovery=${isUpgradeClick ? 'upgrade-click' : 'checkout-abandoned'}`;
  const heading = isUpgradeClick
    ? 'Unlock the feature you tried to use'
    : 'Your checkout is still waiting';
  const bodyCopy = isUpgradeClick
    ? 'You were close to unlocking sharper exports and higher quality models. You can pick up from pricing when you are ready.'
    : 'You left before finishing checkout. Your plan options are still ready, and you can return directly to pricing.';
  const ctaLabel = isUpgradeClick ? 'Review upgrade options' : 'Return to checkout';

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
            {trigger && (
              <Text style={note}>
                This reminder is based on your recent {trigger.replace(/_/g, ' ')} action.
              </Text>
            )}
            <Button href={finalCtaUrl} style={button}>
              {ctaLabel}
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
  backgroundColor: '#0f172a',
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
