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

interface IBlogEducationEmailProps {
  userName?: string;
  articleTitle: string;
  articleDescription?: string;
  articleUrl: string;
  productCtaUrl: string;
  productCtaLabel?: string;
  preferenceUrl?: string;
  supportEmail: string;
  appName?: string;
}

export function BlogEducationEmail({
  userName = 'there',
  articleTitle,
  articleDescription,
  articleUrl,
  productCtaUrl,
  productCtaLabel = 'Try it on your image',
  preferenceUrl,
  supportEmail,
  appName = 'MyImageUpscaler',
}: IBlogEducationEmailProps): React.JSX.Element {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logo}>{appName}</Text>
          </Section>
          <Section style={content}>
            <Text style={heading}>Guide: {articleTitle}</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              {articleDescription || 'A short guide connected to the workflow you tried.'}
            </Text>
            <Button href={articleUrl} style={button}>
              Read guide
            </Button>
            <Text style={paragraph}>Want to apply it right away?</Text>
            <Button href={productCtaUrl} style={secondaryButton}>
              {productCtaLabel}
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
                  Manage email preferences
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
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' };
const header = { backgroundColor: '#0f172a', padding: '24px', textAlign: 'center' as const };
const logo = { color: '#ffffff', fontSize: '24px', fontWeight: 'bold', margin: '0' };
const content = { padding: '32px 24px' };
const heading = { fontSize: '24px', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px' };
const paragraph = { fontSize: '16px', lineHeight: '24px', color: '#334155', marginBottom: '16px' };
const button = {
  backgroundColor: '#2563eb',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
  marginRight: '12px',
};
const secondaryButton = {
  backgroundColor: '#0f172a',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
};
const hr = { borderColor: '#e2e8f0', margin: '0' };
const footer = { padding: '24px', textAlign: 'center' as const };
const footerText = { fontSize: '14px', color: '#64748b', margin: '4px 0' };
const footerLink = { color: '#2563eb', textDecoration: 'underline' };
