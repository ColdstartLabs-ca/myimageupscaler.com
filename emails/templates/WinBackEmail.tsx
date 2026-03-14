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
  creditOffer?: number;
}

export function WinBackEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  creditOffer = 5,
}: ICampaignEmailProps): React.JSX.Element {
  const claimUrl = `${baseUrl}/dashboard?claim_credits=${creditOffer}`;
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
            <Text style={heading}>We Miss You!</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              It&apos;s been a while since you last used {appName}. We&apos;d love to see you back!
            </Text>

            <Section style={offerBox}>
              <Text style={offerTitle}>A Special Gift For You</Text>
              <Text style={offerCredits}>{creditOffer} Free Credits</Text>
              <Text style={offerText}>
                Use these credits to try our premium upscaling features - on us!
              </Text>
            </Section>

            <Text style={paragraph}>
              Whether you need to enhance old photos, prepare images for print, or just want
              crystal-clear results, we&apos;re here to help.
            </Text>

            <Button href={claimUrl} style={button}>
              Claim Your Free Credits
            </Button>

            <Text style={subtext}>Offer expires in 7 days. No purchase required.</Text>
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
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  border: '2px solid #3b82f6',
};

const offerTitle = {
  fontSize: '16px',
  color: '#334155',
  marginBottom: '8px',
};

const offerCredits = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#3b82f6',
  marginBottom: '8px',
};

const offerText = {
  fontSize: '14px',
  color: '#64748b',
  marginBottom: '0',
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
