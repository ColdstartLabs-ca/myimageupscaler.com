/**
 * Hero Section Component
 * Based on PRD-PSEO-05 Section 3.1: Hero Section
 */

'use client';

import { analytics } from '@client/analytics/analyticsClient';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { HeroBeforeAfter } from '@client/components/landing/HeroBeforeAfter';
import { motion } from 'framer-motion';
import { ReactElement } from 'react';

// Animation variants for hero section
const heroContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
};

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
    <section className="pt-12 pb-16 md:pt-16 md:pb-20 relative overflow-hidden hero-gradient-2025">
      <AmbientBackground variant="hero" />

      <motion.div
        className="text-center max-w-4xl mx-auto relative z-10"
        initial="hidden"
        animate="visible"
        variants={heroContainerVariants}
      >
        {/* Badge */}
        <motion.div variants={heroItemVariants} className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-muted-foreground font-medium text-sm mb-8 hover:shadow-xl hover:shadow-accent/20 transition-all duration-300 cursor-default group">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          AI-Powered Tool
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          variants={heroItemVariants}
          className="text-6xl sm:text-6xl md:text-8xl font-black mb-8 tracking-tight text-white leading-[1.05]"
        >
          {mainTitle}
          {subtitle && (
            <span className="block mt-4 gradient-text-primary">
              {subtitle}
            </span>
          )}
        </motion.h1>

        {/* Intro Text */}
        <motion.p
          variants={heroItemVariants}
          className="text-xl md:text-2xl text-text-secondary mb-10 max-w-3xl mx-auto leading-relaxed font-light"
        >
          {intro}
        </motion.p>

        {/* CTA Section */}
        {ctaText && ctaUrl && (
          <motion.div variants={heroItemVariants} className="flex flex-col items-center gap-8">
            <motion.a
              href={ctaUrl}
              onClick={handleCTAClick}
              className="group relative inline-flex items-center gap-3 px-10 py-5 text-white rounded-xl font-semibold text-xl transition-all duration-300 gradient-cta shine-effect shadow-xl shadow-accent/20"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
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
            </motion.a>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-base text-text-secondary">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Free to start</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No watermarks</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Instant results</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Hero Before/After Slider */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <HeroBeforeAfter />
        </motion.div>
      </motion.div>
    </section>
  );
}
