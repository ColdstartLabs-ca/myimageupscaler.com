/**
 * FAQ Section Component
 * Based on PRD-PSEO-05 Section 3.3: FAQ Section
 * Client component for accordion state management
 */

'use client';

import type { IFAQ } from '@/lib/seo/pseo-types';
import { analytics } from '@client/analytics/analyticsClient';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { FAQ } from '@client/components/ui/FAQ';
import type { IFAQItem } from '@client/components/ui/FAQ';
import { ReactElement, useState } from 'react';
import { motion } from 'framer-motion';

interface IFAQSectionProps {
  faqs: IFAQ[];
  title?: string;
  pageType:
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

export function FAQSection({
  faqs,
  title = 'Frequently Asked Questions',
  pageType,
  slug,
}: IFAQSectionProps): ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!faqs || faqs.length === 0) {
    return <></>;
  }

  function handleFAQToggle(index: number | null): void {
    setOpenIndex(index);

    // Track FAQ expansion
    if (index !== null && pageType && slug) {
      analytics.track('pseo_faq_expanded', {
        pageType,
        slug,
        elementType: 'faq',
        elementId: `faq-${index}`,
        question: faqs[index].question,
      });
    }
  }

  // Convert IFAQ to IFAQItem format
  const faqItems: IFAQItem[] = faqs.map(faq => ({
    question: faq.question,
    answer: faq.answer,
  }));

  return (
    <section className="py-24 relative">
      <AmbientBackground variant="section" />
      <motion.div
        className="text-center mb-16 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const }}
      >
        <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">{title}</h2>
        <p className="text-xl text-text-secondary max-w-2xl mx-auto">
          Find answers to common questions about our tool and how it works.
        </p>
      </motion.div>
      <div className="relative z-10">
        <FAQ items={faqItems} openIndex={openIndex} onToggle={handleFAQToggle} />
      </div>
    </section>
  );
}
