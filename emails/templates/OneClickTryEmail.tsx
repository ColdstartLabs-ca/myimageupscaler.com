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
  sampleImageUrl?: string;
}

export function OneClickTryEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
  sampleImageUrl,
}: ICampaignEmailProps): React.JSX.Element {
  const tryUrl = sampleImageUrl
    ? `${baseUrl}/dashboard?sample_image=${encodeURIComponent(sampleImageUrl)}`
    : `${baseUrl}/dashboard`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>Try It With One Click</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        Still haven&apos;t tried AI upscaling? We&apos;ve made it easier than ever. No need to find
        an image - we&apos;ve got a sample ready for you.
      </Text>

      <Section style={highlightBox}>
        <Text style={highlightTitle}>One Click to Amazing Results</Text>
        <Text style={highlightText}>
          Click the button below and we&apos;ll load a sample image. Watch as our AI transforms it
          into a crisp, detailed version.
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Experience the power of AI upscaling in seconds. Once you see the results, you&apos;ll want
        to enhance all your images.
      </Text>

      <Button href={tryUrl} style={s.button}>
        Try With Sample Image
      </Button>

      <Text style={s.subtext}>Or upload your own image anytime from the dashboard.</Text>
    </CampaignEmailLayout>
  );
}

const highlightBox = {
  backgroundColor: '#f0fdf4',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
  border: '1px solid #86efac',
};

const highlightTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#166534',
  marginBottom: '8px',
};

const highlightText = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#166534',
  marginBottom: '0',
};
