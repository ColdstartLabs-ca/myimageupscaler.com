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
  creditsUsed?: number;
  creditsTotal?: number;
}

export function TrialProgressEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  trialDaysRemaining = 4,
  creditsUsed = 0,
  creditsTotal = 10,
}: ICampaignEmailProps): React.JSX.Element {
  const dashboardUrl = `${baseUrl}/dashboard`;
  const unsubscribeUrl = unsubscribeToken
    ? `${baseUrl}/api/campaigns/unsubscribe?token=${unsubscribeToken}`
    : `${baseUrl}/dashboard/settings`;

  const creditsRemaining = creditsTotal - creditsUsed;
  const progressPercent = Math.round((creditsUsed / creditsTotal) * 100);

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>

          <Section style={content}>
            <Text style={heading}>Your Trial is Progressing</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              You&apos;re making great progress! Here&apos;s your trial status:
            </Text>

            <Section style={statsBox}>
              <Text style={statsTitle}>Trial Status</Text>
              <Text style={statsItem}>
                <strong>Days Remaining:</strong> {trialDaysRemaining} days
              </Text>
              <Text style={statsItem}>
                <strong>Credits Used:</strong> {creditsUsed} of {creditsTotal}
              </Text>
              <Text style={statsItem}>
                <strong>Credits Remaining:</strong> {creditsRemaining}
              </Text>
              <Section style={progressBarBg}>
                <Section style={{ ...progressBarFill, width: `${progressPercent}%` }} />
              </Section>
            </Section>

            <Section style={tipBox}>
              <Text style={tipTitle}>Pro Tip</Text>
              <Text style={tipText}>
                Try the 4x upscale with AI enhancement for the best results. It&apos;s perfect for
                preparing images for print or recovering detail in old photos.
              </Text>
            </Section>

            <Text style={paragraph}>
              Make the most of your remaining credits - explore batch processing or try different
              upscale factors!
            </Text>

            <Button href={dashboardUrl} style={button}>
              Continue Using Your Trial
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
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const statsTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const statsItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '8px',
};

const progressBarBg = {
  backgroundColor: '#e2e8f0',
  borderRadius: '4px',
  height: '8px',
  marginTop: '12px',
  overflow: 'hidden',
};

const progressBarFill = {
  backgroundColor: '#3b82f6',
  borderRadius: '4px',
  height: '8px',
};

const tipBox = {
  backgroundColor: '#fffbeb',
  borderRadius: '8px',
  padding: '16px 20px',
  marginBottom: '24px',
  border: '1px solid #fcd34d',
};

const tipTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#92400e',
  marginBottom: '4px',
};

const tipText = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#92400e',
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
