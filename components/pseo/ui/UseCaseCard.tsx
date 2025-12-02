/**
 * Use Case Card Component
 * Based on PRD-PSEO-05: Component Library
 */

import type { IUseCase } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';

interface IUseCaseCardProps {
  useCase: IUseCase;
}

// Use case configurations with colors
const useCaseConfigs: Record<string, { icon: ReactElement; color: string }> = {
  ecommerce: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
    ),
    color: '#f97316',
  },
  realestate: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
    color: '#10b981',
  },
  social: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
    color: '#8b5cf6',
  },
  print: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
    ),
    color: '#3b82f6',
  },
  default: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
    color: '#6366f1',
  },
};

function getConfigForUseCase(title: string): { icon: ReactElement; color: string } {
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes('commerce') ||
    lowerTitle.includes('product') ||
    lowerTitle.includes('shop')
  )
    return useCaseConfigs.ecommerce;
  if (
    lowerTitle.includes('real estate') ||
    lowerTitle.includes('property') ||
    lowerTitle.includes('listing')
  )
    return useCaseConfigs.realestate;
  if (
    lowerTitle.includes('social') ||
    lowerTitle.includes('media') ||
    lowerTitle.includes('content')
  )
    return useCaseConfigs.social;
  if (
    lowerTitle.includes('print') ||
    lowerTitle.includes('material') ||
    lowerTitle.includes('poster')
  )
    return useCaseConfigs.print;
  return useCaseConfigs.default;
}

export function UseCaseCard({ useCase }: IUseCaseCardProps): ReactElement {
  const { icon, color } = getConfigForUseCase(useCase.title);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 h-full flex flex-col hover:shadow-lg hover:border-purple-200 transition-all duration-300">
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-md text-white"
        style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` }}
      >
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold text-slate-900 mb-3">{useCase.title}</h3>

      {/* Description */}
      <p className="text-base text-slate-600 leading-relaxed flex-grow">{useCase.description}</p>

      {/* Example */}
      {useCase.example && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Example: </span>
            {useCase.example}
          </p>
        </div>
      )}
    </div>
  );
}
