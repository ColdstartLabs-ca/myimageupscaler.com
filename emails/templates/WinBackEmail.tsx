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
  creditOffer?: number;
}

export function WinBackEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  creditOffer = 5,
}: ICampaignEmailProps): React.JSX.Element {
  const claimUrl = `${baseUrl}/dashboard?claim_credits=${creditOffer}`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>We Miss You!</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        It&apos;s been a while since you last used {appName}. We&apos;d love to see you back!
      </Text>

      <Section style={offerBox}>
        <Text style={offerTitle}>A Special Gift For You</Text>
        <Text style={offerCredits}>{creditOffer} Free Credits</Text>
        <Text style={offerText}>
          Use these credits to try our premium upscaling features - on us!
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Whether you need to enhance old photos, prepare images for print, or just want crystal-clear
        results, we&apos;re here to help.
      </Text>

      <Button href={claimUrl} style={s.button}>
        Claim Your Free Credits
      </Button>

      <Text style={s.subtext}>Offer expires in 7 days. No purchase required.</Text>
    </CampaignEmailLayout>
  );
}

const offerBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  border: '2px solid #3b82f6',
};

const offerTitle = {
  fontSize: '16px',
  color: '#334155',
  marginBottom: '8px',
};

const offerCredits = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#3b82f6',
  marginBottom: '8px',
};

const offerText = {
  fontSize: '14px',
  color: '#64748b',
  marginBottom: '0',
};
