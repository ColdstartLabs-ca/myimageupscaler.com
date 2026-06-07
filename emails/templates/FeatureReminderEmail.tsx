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

interface IFeatureReminderEmailProps {
  userName?: string;
  headline?: string;
  featureList?: string[];
  ctaUrl?: string;
  preferenceUrl?: string;
  baseUrl: string;
  supportEmail: string;
  appName?: string;
}

export function FeatureReminderEmail({
  userName = 'there',
  headline = 'Try a sharper version of your image',
  featureList = ['HD upscaling', 'Ultra detail', 'Cleaner text and edges'],
  ctaUrl,
  preferenceUrl,
  baseUrl,
  supportEmail,
  appName = 'MyImageUpscaler',
}: IFeatureReminderEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>
          <Section style={content}>
            <Text style={heading}>{headline}</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>A few workflows that may fit your next image:</Text>
            {featureList.map(feature => (
              <Text key={feature} style={listItem}>
                - {feature}
              </Text>
            ))}
            <Button href={ctaUrl || `${baseUrl}/upscale`} style={button}>
              Try feature
            </Button>
          </Section>
          <Footer supportEmail={supportEmail} appName={appName} preferenceUrl={preferenceUrl} />
        </Container>
      </Body>
    </Html>
  );
}

function Footer({
  supportEmail,
  appName,
  preferenceUrl,
}: {
  supportEmail: string;
  appName: string;
  preferenceUrl?: string;
}) {
  return (
    <>
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
    </>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' };
const header = { backgroundColor: '#0f172a', padding: '24px', textAlign: 'center' as const };
const logo = { color: '#ffffff', fontSize: '24px', fontWeight: 'bold', margin: '0' };
const content = { padding: '32px 24px' };
const heading = { fontSize: '24px', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px' };
const paragraph = { fontSize: '16px', lineHeight: '24px', color: '#334155', marginBottom: '16px' };
const listItem = { fontSize: '16px', lineHeight: '24px', color: '#334155', margin: '4px 0' };
const button = {
  backgroundColor: '#2563eb',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
  marginTop: '16px',
};
const hr = { borderColor: '#e2e8f0', margin: '0' };
const footer = { padding: '24px', textAlign: 'center' as const };
const footerText = { fontSize: '14px', color: '#64748b', margin: '4px 0' };
const footerLink = { color: '#2563eb', textDecoration: 'underline' };
