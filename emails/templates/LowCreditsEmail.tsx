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

interface ILowCreditsEmailProps {
  userName?: string;
  creditsRemaining?: number;
  requiredCredits?: number;
  returnUrl?: string;
  ctaUrl?: string;
  preferenceUrl?: string;
  variant?: 'low' | 'zero' | 'insufficient';
  upgradeUrl?: string;
  baseUrl: string;
  supportEmail: string;
  appName?: string;
}

export function LowCreditsEmail({
  userName = 'there',
  creditsRemaining,
  requiredCredits,
  returnUrl,
  ctaUrl,
  preferenceUrl,
  variant = 'low',
  upgradeUrl,
  baseUrl,
  supportEmail,
  appName = 'MyImageUpscaler',
}: ILowCreditsEmailProps): React.JSX.Element {
  const pricingUrl = `${baseUrl}/pricing`;
  const finalCtaUrl = ctaUrl || returnUrl || upgradeUrl || pricingUrl;
  const headingText =
    variant === 'insufficient'
      ? 'Finish This Image'
      : creditsRemaining === 0 || variant === 'zero'
        ? 'You Are Out of Credits'
        : 'Running Low on Credits';
  const ctaLabel =
    variant === 'insufficient'
      ? 'Finish this image'
      : creditsRemaining === 0
        ? 'Add credits'
        : 'Get more credits';

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>

          <Section style={content}>
            <Text style={heading}>{headingText}</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              {variant === 'insufficient' && requiredCredits !== undefined
                ? `That image needs ${requiredCredits} credits. You currently have ${creditsRemaining ?? 0}.`
                : creditsRemaining !== undefined
                  ? `You have ${creditsRemaining} credits remaining.`
                  : 'Your credit balance is getting low.'}
            </Text>
            <Text style={paragraph}>
              {variant === 'insufficient'
                ? 'Top up and come straight back to the image you were working on.'
                : 'Top up your credits before the next upscale so your workflow does not stop.'}
            </Text>

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
                  Manage low-credit alerts
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
  backgroundColor: '#3b82f6',
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

const heading = {
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

const button = {
  backgroundColor: '#3b82f6',
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
  color: '#3b82f6',
  textDecoration: 'underline',
};
