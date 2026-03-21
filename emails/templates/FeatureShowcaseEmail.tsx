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

export function FeatureShowcaseEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
}: ICampaignEmailProps): React.JSX.Element {
  const featuresUrl = `${baseUrl}/features`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>See What You&apos;re Missing</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Your first upscale was just the beginning. Premium users unlock results that are up to 4x
        sharper with significantly more detail recovery.
      </Text>

      <Section style={showcaseBox}>
        <Text style={showcaseTitle}>Before vs After</Text>
        <Text style={showcaseItem}>Standard: Basic 2x upscaling</Text>
        <Text style={showcaseItem}>Premium: 4x with AI detail enhancement</Text>
        <Text style={showcaseItem}>Premium: Noise reduction and sharpening</Text>
        <Text style={showcaseItem}>Premium: Batch processing support</Text>
      </Section>

      <Text style={s.paragraph}>
        Our advanced AI models recover details you didn&apos;t know were there. Old photos,
        low-resolution images, and compressed files all benefit from premium processing.
      </Text>

      <Button href={featuresUrl} style={s.button}>
        Explore Premium Features
      </Button>
    </CampaignEmailLayout>
  );
}

const showcaseBox = {
  backgroundColor: '#f1f5f9',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
};

const showcaseTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const showcaseItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '6px',
};
