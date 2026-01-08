/**
 * Benefit Card Component
 * Based on PRD-PSEO-05: Component Library
 */

import type { IBenefit } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';

interface IBenefitCardProps {
  benefit: IBenefit;
}

// Icon mapping for common benefit types
const benefitIcons: Record<string, ReactElement> = {
  quality: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  ),
  time: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  consistent: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  default: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
};

function getIconForBenefit(title: string): ReactElement {
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes('quality') ||
    lowerTitle.includes('professional') ||
    lowerTitle.includes('studio')
  )
    return benefitIcons.quality;
  if (
    lowerTitle.includes('time') ||
    lowerTitle.includes('save') ||
    lowerTitle.includes('hour') ||
    lowerTitle.includes('fast')
  )
    return benefitIcons.time;
  if (
    lowerTitle.includes('consistent') ||
    lowerTitle.includes('reliable') ||
    lowerTitle.includes('every')
  )
    return benefitIcons.consistent;
  return benefitIcons.default;
}

export function BenefitCard({ benefit }: IBenefitCardProps): ReactElement {
  const icon = getIconForBenefit(benefit.title);

  return (
    <div className="group glass-card animated-border h-full flex flex-col">
      <div className="mb-6 w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-md bg-success">
        {icon}
      </div>

      <h3 className="text-xl font-bold mb-3 text-text-primary group-hover:text-accent transition-colors">
        {benefit.title}
      </h3>
      <p className="text-text-secondary text-base leading-relaxed mb-4 flex-grow">
        {benefit.description}
      </p>

      {benefit.metric && (
        <div className="mt-auto pt-4">
          <div className="inline-flex items-center gap-2 text-base font-semibold text-white bg-accent/20 px-5 py-2.5 rounded-lg border border-accent/30">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z"
                clipRule="evenodd"
              />
            </svg>
            {benefit.metric}
          </div>
        </div>
      )}
    </div>
  );
}
