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

interface ICampaignEmailProps {
  userName?: string;
  baseUrl?: string;
  supportEmail?: string;
  appName?: string;
  unsubscribeToken?: string;
  trialDaysRemaining?: number;
  creditsRemaining?: number;
}

export function TrialReminderEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  trialDaysRemaining = 2,
  creditsRemaining = 5,
}: ICampaignEmailProps): React.JSX.Element {
  const pricingUrl = `${baseUrl}/pricing`;
  const unsubscribeUrl = unsubscribeToken
    ? `${baseUrl}/api/campaigns/unsubscribe?token=${unsubscribeToken}`
    : `${baseUrl}/dashboard/settings`;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>

          <Section style={content}>
            <Text style={heading}>Your Trial is Halfway Through</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Just checking in! Your premium trial is progressing well. Here&apos;s where you stand:
            </Text>

            <Section style={statsBox}>
              <Text style={statsNumber}>{trialDaysRemaining}</Text>
              <Text style={statsLabel}>Days Remaining</Text>
              <Text style={statsDivider}>|</Text>
              <Text style={statsNumber}>{creditsRemaining}</Text>
              <Text style={statsLabel}>Credits Left</Text>
            </Section>

            <Text style={paragraph}>
              You&apos;ve experienced the power of premium upscaling. When your trial ends,
              you&apos;ll still have access to basic features, but premium enhancements require a
              subscription.
            </Text>

            <Section style={previewBox}>
              <Text style={previewTitle}>What You Get with Premium</Text>
              <Text style={previewItem}>Unlimited 4x upscaling</Text>
              <Text style={previewItem}>Batch processing</Text>
              <Text style={previewItem}>Priority processing speed</Text>
              <Text style={previewItem}>Advanced AI models</Text>
            </Section>

            <Button href={pricingUrl} style={button}>
              View Subscription Plans
            </Button>

            <Text style={subtext}>Starting from just $9/month. Cancel anytime.</Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              Questions?{' '}
              <Link href={`mailto:${supportEmail}`} style={footerLink}>
                Contact us
              </Link>
            </Text>
            <Text style={footerText}>
              <Link href={unsubscribeUrl} style={footerLink}>
                Unsubscribe from marketing emails
              </Link>
            </Text>
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

const statsBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  display: 'flex',
};

const statsNumber = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#3b82f6',
  marginBottom: '4px',
};

const statsLabel = {
  fontSize: '14px',
  color: '#64748b',
  marginBottom: '0',
};

const statsDivider = {
  fontSize: '32px',
  color: '#cbd5e1',
  margin: '0 24px',
};

const previewBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const previewTitle = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const previewItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '6px',
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

const subtext = {
  fontSize: '14px',
  color: '#64748b',
  marginTop: '16px',
  marginBottom: '0',
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
