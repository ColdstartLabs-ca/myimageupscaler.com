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
  sampleImageUrl?: string;
}

export function OneClickTryEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  sampleImageUrl,
}: ICampaignEmailProps): React.JSX.Element {
  const tryUrl = sampleImageUrl
    ? `${baseUrl}/dashboard?sample_image=${encodeURIComponent(sampleImageUrl)}`
    : `${baseUrl}/dashboard`;
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
            <Text style={heading}>Try It With One Click</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Still haven&apos;t tried AI upscaling? We&apos;ve made it easier than ever. No need to
              find an image - we&apos;ve got a sample ready for you.
            </Text>

            <Section style={highlightBox}>
              <Text style={highlightTitle}>One Click to Amazing Results</Text>
              <Text style={highlightText}>
                Click the button below and we&apos;ll load a sample image. Watch as our AI
                transforms it into a crisp, detailed version.
              </Text>
            </Section>

            <Text style={paragraph}>
              Experience the power of AI upscaling in seconds. Once you see the results, you&apos;ll
              want to enhance all your images.
            </Text>

            <Button href={tryUrl} style={button}>
              Try With Sample Image
            </Button>

            <Text style={subtext}>Or upload your own image anytime from the dashboard.</Text>
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

const highlightBox = {
  backgroundColor: '#f0fdf4',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
  border: '1px solid #86efac',
};

const highlightTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#166534',
  marginBottom: '8px',
};

const highlightText = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#166534',
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
