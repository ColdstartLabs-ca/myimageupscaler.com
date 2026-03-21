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
  trialDaysRemaining?: number;
  creditsRemaining?: number;
}

export function TrialReminderEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  trialDaysRemaining = 2,
  creditsRemaining = 5,
}: ICampaignEmailProps): React.JSX.Element {
  const pricingUrl = `${baseUrl}/pricing`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Your Trial is Halfway Through</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Just checking in! Your premium trial is progressing well. Here&apos;s where you stand:
      </Text>

      <Section style={statsBox}>
        <Text style={statsNumber}>{trialDaysRemaining}</Text>
        <Text style={statsLabel}>Days Remaining</Text>
        <Text style={statsDivider}>|</Text>
        <Text style={statsNumber}>{creditsRemaining}</Text>
        <Text style={statsLabel}>Credits Left</Text>
      </Section>

      <Text style={s.paragraph}>
        You&apos;ve experienced the power of premium upscaling. When your trial ends, you&apos;ll
        still have access to basic features, but premium enhancements require a subscription.
      </Text>

      <Section style={previewBox}>
        <Text style={previewTitle}>What You Get with Premium</Text>
        <Text style={previewItem}>Unlimited 4x upscaling</Text>
        <Text style={previewItem}>Batch processing</Text>
        <Text style={previewItem}>Priority processing speed</Text>
        <Text style={previewItem}>Advanced AI models</Text>
      </Section>

      <Button href={pricingUrl} style={s.button}>
        View Subscription Plans
      </Button>

      <Text style={s.subtext}>Starting from just $9/month. Cancel anytime.</Text>
    </CampaignEmailLayout>
  );
}

const statsBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  display: 'flex',
};

const statsNumber = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#3b82f6',
  marginBottom: '4px',
};

const statsLabel = {
  fontSize: '14px',
  color: '#64748b',
  marginBottom: '0',
};

const statsDivider = {
  fontSize: '32px',
  color: '#cbd5e1',
  margin: '0 24px',
};

const previewBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const previewTitle = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const previewItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '6px',
};
