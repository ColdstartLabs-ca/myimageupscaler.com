/**
 * FAQ Section Component
 * Based on PRD-PSEO-05 Section 3.3: FAQ Section
 * Client component for accordion state management
 */

'use client';

import type { IFAQ } from '@/lib/seo/pseo-types';
import { analytics } from '@client/analytics/analyticsClient';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { ReactElement, useState } from 'react';
import { motion } from 'framer-motion';
import { FAQAccordion } from '../ui/FAQAccordion';

interface IFAQSectionProps {
  faqs: IFAQ[];
  title?: string;
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
};

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

  function handleFAQToggle(index: number, question: string): void {
    const newIndex = openIndex === index ? null : index;
    setOpenIndex(newIndex);

    // Track FAQ expansion
    if (newIndex === index && pageType && slug) {
      analytics.track('pseo_faq_expanded', {
        pageType,
        slug,
        elementType: 'faq',
        elementId: `faq-${index}`,
        question,
      });
    }
  }

  return (
    <section className="py-24 relative overflow-hidden">
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
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-3xl mx-auto space-y-6 relative z-10"
      >
        {faqs.map((faq, index) => (
          <motion.div key={index} variants={itemVariants}>
            <FAQAccordion
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => handleFAQToggle(index, faq.question)}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
