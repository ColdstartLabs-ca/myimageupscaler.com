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

export function PossibilityShowcaseEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
}: ICampaignEmailProps): React.JSX.Element {
  const examplesUrl = `${baseUrl}/examples`;
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
            <Text style={heading}>See What&apos;s Possible</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              You haven&apos;t tried upscaling yet, and you&apos;re missing out on some amazing
              transformations. Here&apos;s what our AI can do:
            </Text>

            <Section style={useCaseList}>
              <Text style={useCaseTitle}>Popular Use Cases</Text>
              <Text style={useCaseItem}>
                <strong>Photo Restoration:</strong> Bring old family photos back to life with
                enhanced clarity
              </Text>
              <Text style={useCaseItem}>
                <strong>Print Preparation:</strong> Prepare low-res images for high-quality prints
              </Text>
              <Text style={useCaseItem}>
                <strong>Social Media:</strong> Make your posts stand out with crisp, detailed images
              </Text>
              <Text style={useCaseItem}>
                <strong>E-commerce:</strong> Showcase products with professional-quality images
              </Text>
            </Section>

            <Text style={paragraph}>
              Our users consistently report being amazed by the detail recovery in their upscaled
              images. Try it once and you&apos;ll see why.
            </Text>

            <Button href={examplesUrl} style={button}>
              See Before & After Examples
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

const useCaseList = {
  marginBottom: '24px',
};

const useCaseTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const useCaseItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '12px',
  paddingLeft: '16px',
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
