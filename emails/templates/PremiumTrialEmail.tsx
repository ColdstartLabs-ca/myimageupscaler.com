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
  trialDays?: number;
}

export function PremiumTrialEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  trialDays = 7,
}: ICampaignEmailProps): React.JSX.Element {
  const trialUrl = `${baseUrl}/dashboard?start_trial=true`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Try Premium Features Free</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        You&apos;ve experienced the power of AI upscaling. Now unlock even more with a free{' '}
        {trialDays}-day trial of our premium features.
      </Text>

      <Section style={featureList}>
        <Text style={featureItem}>4x upscaling with enhanced detail recovery</Text>
        <Text style={featureItem}>Batch processing for multiple images</Text>
        <Text style={featureItem}>Priority processing speed</Text>
        <Text style={featureItem}>Access to advanced AI models</Text>
      </Section>

      <Text style={s.paragraph}>
        No credit card required. Start your trial today and see the difference.
      </Text>

      <Button href={trialUrl} style={s.button}>
        Start Free Trial
      </Button>

      <Text style={s.subtext}>Cancel anytime during the trial period.</Text>
    </CampaignEmailLayout>
  );
}

const featureList = {
  marginBottom: '24px',
  paddingLeft: '24px',
};

const featureItem = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '8px',
};
