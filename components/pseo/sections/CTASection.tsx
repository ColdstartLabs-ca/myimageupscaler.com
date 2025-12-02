/**
 * CTA (Call to Action) Section Component
 * Based on PRD-PSEO-05: Component Library
 */

'use client';

import { analytics } from '@client/analytics/analyticsClient';
import Link from 'next/link';
import { ReactElement } from 'react';

interface ICTASectionProps {
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  pageType?:
    | 'tool'
    | 'comparison'
    | 'guide'
    | 'useCase'
    | 'alternative'
    | 'format'
    | 'scale'
    | 'free';
  slug?: string;
}

export function CTASection({
  title,
  description,
  ctaText,
  ctaUrl,
  pageType,
  slug,
}: ICTASectionProps): ReactElement {
  function handleCTAClick(): void {
    if (pageType && slug) {
      analytics.track('pseo_cta_clicked', {
        pageType,
        slug,
        elementType: 'cta',
        elementId: 'bottom-cta',
      });
    }
  }

  return (
    <section
      className="py-20 rounded-2xl text-center text-white relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 50%, #7c3aed 100%)',
      }}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(80px)' }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full"
          style={{ background: 'rgba(139,92,246,0.15)', filter: 'blur(80px)' }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto px-6">
        <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">{title}</h2>
        <p className="text-xl md:text-2xl mb-10 text-white/90 max-w-2xl mx-auto font-light">
          {description}
        </p>

        {/* CTA Button */}
        <Link
          href={ctaUrl}
          onClick={handleCTAClick}
          className="group inline-flex items-center gap-3 px-10 py-5 bg-white text-blue-600 rounded-xl font-semibold text-xl hover:bg-blue-50 transition-all duration-300 shadow-2xl hover:shadow-[0_30px_60px_-12px_rgba(0,0,0,0.4)] hover:-translate-y-1"
        >
          {ctaText}
          <svg
            className="w-6 h-6 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>

        {/* Trust indicators */}
        <div className="mt-10 flex flex-wrap justify-center gap-8 text-base text-white/80">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>10 free credits</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>No signup required</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Instant results</span>
          </div>
        </div>
      </div>
    </section>
  );
}
