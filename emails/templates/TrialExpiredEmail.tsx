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

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Your Trial Has Ended</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Your premium trial has expired, but it&apos;s not too late to continue enjoying the enhanced
        features you&apos;ve been using.
      </Text>

      <Section style={offerBox}>
        <Text style={offerTitle}>One More Chance</Text>
        <Text style={offerDiscount}>{discountPercent}% OFF Your Subscription</Text>
        <Text style={offerText}>
          We want you to experience the full power of {appName}. Here&apos;s an exclusive discount
          just for you.
        </Text>
        <Text style={offerCode}>
          Code: <strong>{discountCode}</strong>
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Upgrade now and get back to creating stunning, high-resolution images with our premium AI
        models. This special offer won&apos;t last forever.
      </Text>

      <Button href={upgradeUrl} style={greenButton}>
        Continue With {discountPercent}% Off
      </Button>

      <Text style={s.subtext}>This exclusive discount expires in 48 hours.</Text>
    </CampaignEmailLayout>
  );
}

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

const greenButton = {
  ...s.button,
  backgroundColor: '#15803d',
};
