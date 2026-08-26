'use client';

import { useEffect, useState } from 'react';
import { ChatGPTBadge } from './ChatGPTBadge';
import { getBrowserReferralSource } from '@client/analytics/referralSource';
import type { IReferralSource } from '@server/analytics/types';

type IBadgeReferralSource = Extract<
  IReferralSource,
  'chatgpt' | 'perplexity' | 'claude' | 'google_sge'
>;

function isBadgeSource(source: IReferralSource | null): source is IBadgeReferralSource {
  return source !== null && ['chatgpt', 'perplexity', 'claude', 'google_sge'].includes(source);
}

export function ReferralBadge(): JSX.Element | null {
  const [source, setSource] = useState<IBadgeReferralSource | null>(null);

  useEffect(() => {
    const referralSource = getBrowserReferralSource();
    if (isBadgeSource(referralSource)) setSource(referralSource);
  }, []);

  return source ? (
    <div className="mb-3 lg:mb-5 lg:ml-1">
      <ChatGPTBadge source={source} />
    </div>
  ) : null;
}
