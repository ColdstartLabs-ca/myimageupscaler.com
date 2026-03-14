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
}

export function GettingStartedEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
}: ICampaignEmailProps): React.JSX.Element {
  const dashboardUrl = `${baseUrl}/dashboard`;
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
            <Text style={heading}>Getting Started with AI Upscaling</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Welcome to {appName}! Your account is ready, and you have free credits waiting to be
              used. Here&apos;s how to get started in under a minute:
            </Text>

            <Section style={stepList}>
              <Text style={stepItem}>
                <strong>Step 1:</strong> Upload any image - JPG, PNG, or WebP
              </Text>
              <Text style={stepItem}>
                <strong>Step 2:</strong> Choose your upscale factor (2x, 3x, or 4x)
              </Text>
              <Text style={stepItem}>
                <strong>Step 3:</strong> Download your enhanced image
              </Text>
            </Section>

            <Text style={paragraph}>
              Our AI technology recovers lost details, reduces noise, and delivers sharp, clear
              results - even from low-resolution sources.
            </Text>

            <Button href={dashboardUrl} style={button}>
              Upload Your First Image
            </Button>

            <Text style={subtext}>
              Perfect for: photos, graphics, product images, social media posts, and more.
            </Text>
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

const stepList = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '20px 20px 20px 24px',
  marginBottom: '24px',
};

const stepItem = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '12px',
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
