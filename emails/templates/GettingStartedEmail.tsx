import React from 'react';
import { Section, Text, Button } from '@react-email/components';
import { CampaignEmailLayout } from '../CampaignEmailLayout';
import { emailStyles as s } from '../styles';

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

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Getting Started with AI Upscaling</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Welcome to {appName}! Your account is ready, and you have free credits waiting to be used.
        Here&apos;s how to get started in under a minute:
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

      <Text style={s.paragraph}>
        Our AI technology recovers lost details, reduces noise, and delivers sharp, clear results -
        even from low-resolution sources.
      </Text>

      <Button href={dashboardUrl} style={s.button}>
        Upload Your First Image
      </Button>

      <Text style={s.subtext}>
        Perfect for: photos, graphics, product images, social media posts, and more.
      </Text>
    </CampaignEmailLayout>
  );
}

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
