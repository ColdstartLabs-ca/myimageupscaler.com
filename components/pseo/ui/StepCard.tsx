/**
 * Step Card Component (for How It Works sections)
 * Based on PRD-PSEO-05: Component Library
 */

import type { IHowItWorksStep } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';

interface IStepCardProps {
  step: IHowItWorksStep;
  isLast?: boolean;
}

// Step icons with proper styling
function getStepIcon(stepNumber: number): ReactElement {
  const icons: Record<number, ReactElement> = {
    1: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    ),
    2: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>
    ),
    3: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
    4: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
    ),
  };

  return icons[stepNumber] || <span className="text-sm font-bold">{stepNumber}</span>;
}

export function StepCard({ step, isLast }: IStepCardProps): ReactElement {
  return (
    <div className={`flex items-start gap-6 relative ${isLast ? '' : 'mb-10'}`}>
      {/* Connecting line */}
      {!isLast && (
        <div
          className="absolute left-7 top-14 bottom-0 w-0.5"
          style={{
            background: 'linear-gradient(180deg, #3b82f6 0%, #cbd5e1 100%)',
          }}
        />
      )}

      {/* Step number circle with icon */}
      <div className="flex-shrink-0 relative z-10">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
          }}
        >
          {getStepIcon(step.step)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-1">
        <div className="mb-2">
          <span className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
            Step {step.step}
          </span>
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h3>
        <p className="text-lg text-slate-600 leading-relaxed">{step.description}</p>
      </div>
    </div>
  );
}
