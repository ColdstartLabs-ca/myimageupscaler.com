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
  creditsUsed?: number;
  creditsTotal?: number;
}

export function TrialProgressEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  trialDaysRemaining = 4,
  creditsUsed = 0,
  creditsTotal = 10,
}: ICampaignEmailProps): React.JSX.Element {
  const dashboardUrl = `${baseUrl}/dashboard`;
  const creditsRemaining = creditsTotal - creditsUsed;
  const progressPercent = Math.round((creditsUsed / creditsTotal) * 100);

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Your Trial is Progressing</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        You&apos;re making great progress! Here&apos;s your trial status:
      </Text>

      <Section style={statsBox}>
        <Text style={statsTitle}>Trial Status</Text>
        <Text style={statsItem}>
          <strong>Days Remaining:</strong> {trialDaysRemaining} days
        </Text>
        <Text style={statsItem}>
          <strong>Credits Used:</strong> {creditsUsed} of {creditsTotal}
        </Text>
        <Text style={statsItem}>
          <strong>Credits Remaining:</strong> {creditsRemaining}
        </Text>
        <Section style={progressBarBg}>
          <Section style={{ ...progressBarFill, width: `${progressPercent}%` }} />
        </Section>
      </Section>

      <Section style={tipBox}>
        <Text style={tipTitle}>Pro Tip</Text>
        <Text style={tipText}>
          Try the 4x upscale with AI enhancement for the best results. It&apos;s perfect for
          preparing images for print or recovering detail in old photos.
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Make the most of your remaining credits - explore batch processing or try different upscale
        factors!
      </Text>

      <Button href={dashboardUrl} style={s.button}>
        Continue Using Your Trial
      </Button>
    </CampaignEmailLayout>
  );
}

const statsBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const statsTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const statsItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '8px',
};

const progressBarBg = {
  backgroundColor: '#e2e8f0',
  borderRadius: '4px',
  height: '8px',
  marginTop: '12px',
  overflow: 'hidden',
};

const progressBarFill = {
  backgroundColor: '#3b82f6',
  borderRadius: '4px',
  height: '8px',
};

const tipBox = {
  backgroundColor: '#fffbeb',
  borderRadius: '8px',
  padding: '16px 20px',
  marginBottom: '24px',
  border: '1px solid #fcd34d',
};

const tipTitle = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#92400e',
  marginBottom: '4px',
};

const tipText = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#92400e',
  marginBottom: '0',
};
