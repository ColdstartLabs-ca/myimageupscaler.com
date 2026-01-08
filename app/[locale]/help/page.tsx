import type { Metadata } from 'next';
import { clientEnv } from '@shared/config/env';
import { HelpClient } from './HelpClient';

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: `Find answers to common questions about ${clientEnv.APP_NAME} image upscaling, credits, billing, and technical support.`,
  alternates: {
    canonical: '/help',
  },
};

export default function HelpPage() {
  return <HelpClient />;
}
