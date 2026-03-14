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

export function TrialExpiredEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  discountPercent = 20,
  discountCode = 'WELCOME20',
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
            <Text style={heading}>Your Trial Has Ended</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Your premium trial has expired, but it&apos;s not too late to continue enjoying the
              enhanced features you&apos;ve been using.
            </Text>

            <Section style={offerBox}>
              <Text style={offerTitle}>One More Chance</Text>
              <Text style={offerDiscount}>{discountPercent}% OFF Your Subscription</Text>
              <Text style={offerText}>
                We want you to experience the full power of {appName}. Here&apos;s an exclusive
                discount just for you.
              </Text>
              <Text style={offerCode}>
                Code: <strong>{discountCode}</strong>
              </Text>
            </Section>

            <Text style={paragraph}>
              Upgrade now and get back to creating stunning, high-resolution images with our premium
              AI models. This special offer won&apos;t last forever.
            </Text>

            <Button href={upgradeUrl} style={button}>
              Continue With {discountPercent}% Off
            </Button>

            <Text style={subtext}>This exclusive discount expires in 48 hours.</Text>
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

const offerBox = {
  backgroundColor: '#f0fdf4',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  border: '2px solid #86efac',
};

const offerTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#166534',
  marginBottom: '8px',
  textTransform: 'uppercase' as const,
};

const offerDiscount = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#15803d',
  marginBottom: '8px',
};

const offerText = {
  fontSize: '15px',
  color: '#166534',
  marginBottom: '12px',
};

const offerCode = {
  fontSize: '16px',
  color: '#166534',
  marginBottom: '0',
};

const button = {
  backgroundColor: '#15803d',
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
