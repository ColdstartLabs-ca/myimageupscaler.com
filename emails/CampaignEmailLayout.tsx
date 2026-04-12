import React from 'react';
import { Html, Head, Body, Container, Section, Text, Hr, Link } from '@react-email/components';
import { emailStyles as s } from './styles';

interface ICampaignEmailLayoutProps {
  children: React.ReactNode;
  appName?: string;
  baseUrl?: string;
  supportEmail?: string;
  unsubscribeToken?: string;
}

/**
 * Shared layout for all campaign (drip) emails.
 *
 * Renders the branded header, footer with contact/unsubscribe links,
 * and wraps the unique content passed as `children`.
 */
export function CampaignEmailLayout({
  children,
  appName = 'MyImageUpscaler',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  unsubscribeToken,
}: ICampaignEmailLayoutProps): React.JSX.Element {
  const unsubscribeUrl = unsubscribeToken
    ? `${baseUrl}/api/campaigns/unsubscribe?token=${unsubscribeToken}`
    : `${baseUrl}/dashboard/settings`;

  return (
    <Html>
      <Head />
      <Body style={s.main}>
        <Container style={s.container}>
          <Section style={s.header}>
            <Text style={s.logo}>{appName}</Text>
          </Section>

          <Section style={s.content}>{children}</Section>

          <Hr style={s.hr} />

          <Section style={s.footer}>
            <Text style={s.footerText}>
              Questions?{' '}
              <Link href={`mailto:${supportEmail}`} style={s.footerLink}>
                Contact us
              </Link>
            </Text>
            <Text style={s.footerText}>
              <Link href={unsubscribeUrl} style={s.footerLink}>
                Unsubscribe from marketing emails
              </Link>
            </Text>
            <Text style={s.footerText}>
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
