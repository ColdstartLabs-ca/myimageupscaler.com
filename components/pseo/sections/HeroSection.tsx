/**
 * Hero Section Component
 * Based on PRD-PSEO-05 Section 3.1: Hero Section
 */

'use client';

import { analytics } from '@client/analytics/analyticsClient';
import Link from 'next/link';
import { ReactElement } from 'react';

interface IHeroSectionProps {
  h1: string;
  intro: string;
  ctaText?: string;
  ctaUrl?: string;
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

export function HeroSection({
  h1,
  intro,
  ctaText,
  ctaUrl,
  pageType,
  slug,
}: IHeroSectionProps): ReactElement {
  function handleCTAClick(): void {
    if (pageType && slug) {
      analytics.track('pseo_cta_clicked', {
        pageType,
        slug,
        elementType: 'cta',
        elementId: 'hero-cta',
      });
    }
  }

  // Split H1 for styling - handles both " - " and natural break points
  const h1Parts = h1.includes(' - ') ? h1.split(' - ') : [h1];
  const mainTitle = h1Parts[0];
  const subtitle = h1Parts[1];

  return (
    <section className="pt-20 pb-16 md:pt-28 md:pb-20 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-[140px] -z-10" />

      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 font-medium text-sm mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          AI-Powered Tool
        </div>

        {/* Main Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-8 tracking-tight text-slate-900 leading-[1.05]">
          {mainTitle}
          {subtitle && (
            <span
              className="block mt-4"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {subtitle}
            </span>
          )}
        </h1>

        {/* Intro Text */}
        <p className="text-xl md:text-2xl text-slate-600 mb-10 max-w-3xl mx-auto leading-relaxed font-light">
          {intro}
        </p>

        {/* CTA Section */}
        {ctaText && ctaUrl && (
          <div className="flex flex-col items-center gap-8">
            <Link
              href={ctaUrl}
              onClick={handleCTAClick}
              className="group relative inline-flex items-center gap-3 px-10 py-5 text-white rounded-xl font-semibold text-xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                boxShadow: '0 20px 40px -12px rgba(37, 99, 235, 0.5)',
              }}
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

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-base text-slate-600">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Free to start</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No watermarks</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
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
        )}
      </div>
    </section>
  );
}
