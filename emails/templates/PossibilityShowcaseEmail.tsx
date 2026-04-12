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

export function PossibilityShowcaseEmail({
  userName = 'there',
  baseUrl = 'https://myimageupscaler.com',
  supportEmail = 'support@myimageupscaler.com',
  appName = 'MyImageUpscaler',
  unsubscribeToken,
}: ICampaignEmailProps): React.JSX.Element {
  const examplesUrl = `${baseUrl}/examples`;

  return (
    <CampaignEmailLayout
      appName={appName}
      baseUrl={baseUrl}
      supportEmail={supportEmail}
      unsubscribeToken={unsubscribeToken}
    >
      <Text style={s.heading}>See What&apos;s Possible</Text>
      <Text style={s.paragraph}>Hi {userName},</Text>
      <Text style={s.paragraph}>
        You haven&apos;t tried upscaling yet, and you&apos;re missing out on some amazing
        transformations. Here&apos;s what our AI can do:
      </Text>

      <Section style={useCaseList}>
        <Text style={useCaseTitle}>Popular Use Cases</Text>
        <Text style={useCaseItem}>
          <strong>Photo Restoration:</strong> Bring old family photos back to life with enhanced
          clarity
        </Text>
        <Text style={useCaseItem}>
          <strong>Print Preparation:</strong> Prepare low-res images for high-quality prints
        </Text>
        <Text style={useCaseItem}>
          <strong>Social Media:</strong> Make your posts stand out with crisp, detailed images
        </Text>
        <Text style={useCaseItem}>
          <strong>E-commerce:</strong> Showcase products with professional-quality images
        </Text>
      </Section>

      <Text style={s.paragraph}>
        Our users consistently report being amazed by the detail recovery in their upscaled images.
        Try it once and you&apos;ll see why.
      </Text>

      <Button href={examplesUrl} style={s.button}>
        See Before & After Examples
      </Button>
    </CampaignEmailLayout>
  );
}

const useCaseList = {
  marginBottom: '24px',
};

const useCaseTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#0f172a',
  marginBottom: '12px',
};

const useCaseItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#334155',
  marginBottom: '12px',
  paddingLeft: '16px',
};
