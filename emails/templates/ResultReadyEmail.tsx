import React from 'react';
import { Text, Button } from '@react-email/components';
import { CampaignEmailLayout } from '../CampaignEmailLayout';
import { emailStyles as s } from '../styles';

interface ICampaignEmailProps {
  userName?: string;
  baseUrl?: string;
  supportEmail?: string;
  appName?: string;
  unsubscribeToken?: string;
  resultUrl?: string;
}

export function ResultReadyEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  resultUrl,
}: ICampaignEmailProps): React.JSX.Element {
  const dashboardUrl = `${baseUrl}/dashboard`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Your Upscaled Image is Ready!</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Great news! Your upscaled image is ready and waiting for you. The enhanced version shows
        significantly more detail and clarity.
      </Text>
      <Text style={s.paragraph}>
        Don&apos;t let your work go to waste - download your result before it expires.
      </Text>

      <Button href={resultUrl || dashboardUrl} style={s.button}>
        View Your Result
      </Button>

      <Text style={s.subtext}>Results are typically available for 7 days after processing.</Text>
    </CampaignEmailLayout>
  );
}
