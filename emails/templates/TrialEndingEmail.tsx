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

export function TrialEndingEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  discountPercent = 15,
  discountCode = 'TRIAL15',
}: ICampaignEmailProps): React.JSX.Element {
  const upgradeUrl = `${baseUrl}/pricing?code=${discountCode}`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Your Trial Ends Tomorrow!</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        This is a friendly reminder that your premium trial ends in just 24 hours. Don&apos;t lose
        access to the features you&apos;ve been enjoying!
      </Text>

      <Section style={urgentBox}>
        <Text style={urgentTitle}>Exclusive Offer - Act Now!</Text>
        <Text style={urgentDiscount}>{discountPercent}% OFF Your First Month</Text>
        <Text style={urgentCode}>
          Use code: <strong>{discountCode}</strong>
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Upgrade now to keep enjoying unlimited 4x upscaling, batch processing, and premium AI
        models. This discount is only available while your trial is active.
      </Text>

      <Button href={upgradeUrl} style={urgentButton}>
        Claim Your Discount
      </Button>

      <Text style={s.subtext}>
        This exclusive offer expires when your trial ends. Don&apos;t miss out!
      </Text>
    </CampaignEmailLayout>
  );
}

const urgentBox = {
  backgroundColor: '#fef2f2',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  border: '2px solid #fca5a5',
};

const urgentTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#991b1b',
  marginBottom: '8px',
  textTransform: 'uppercase' as const,
};

const urgentDiscount = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#dc2626',
  marginBottom: '8px',
};

const urgentCode = {
  fontSize: '16px',
  color: '#7f1d1d',
  marginBottom: '0',
};

const urgentButton = {
  ...s.button,
  backgroundColor: '#dc2626',
};
