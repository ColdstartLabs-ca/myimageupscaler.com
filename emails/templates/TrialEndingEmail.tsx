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
  discountPercent?: number;
  discountCode?: string;
}

export function TrialEndingEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  discountPercent = 15,
  discountCode = 'TRIAL15',
}: ICampaignEmailProps): React.JSX.Element {
  const upgradeUrl = `${baseUrl}/pricing?code=${discountCode}`;
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
            <Text style={heading}>Your Trial Ends Tomorrow!</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              This is a friendly reminder that your premium trial ends in just 24 hours. Don&apos;t
              lose access to the features you&apos;ve been enjoying!
            </Text>

            <Section style={urgentBox}>
              <Text style={urgentTitle}>Exclusive Offer - Act Now!</Text>
              <Text style={urgentDiscount}>{discountPercent}% OFF Your First Month</Text>
              <Text style={urgentCode}>
                Use code: <strong>{discountCode}</strong>
              </Text>
            </Section>

            <Text style={paragraph}>
              Upgrade now to keep enjoying unlimited 4x upscaling, batch processing, and premium AI
              models. This discount is only available while your trial is active.
            </Text>

            <Button href={upgradeUrl} style={button}>
              Claim Your Discount
            </Button>

            <Text style={subtext}>
              This exclusive offer expires when your trial ends. Don&apos;t miss out!
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

const urgentBox = {
  backgroundColor: '#fef2f2',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  border: '2px solid #fca5a5',
};

const urgentTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#991b1b',
  marginBottom: '8px',
  textTransform: 'uppercase' as const,
};

const urgentDiscount = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#dc2626',
  marginBottom: '8px',
};

const urgentCode = {
  fontSize: '16px',
  color: '#7f1d1d',
  marginBottom: '0',
};

const button = {
  backgroundColor: '#dc2626',
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
