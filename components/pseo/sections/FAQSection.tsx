/**
 * FAQ Section Component
 * Based on PRD-PSEO-05 Section 3.3: FAQ Section
 * Client component for accordion state management
 */

'use client';

import type { IFAQ } from '@/lib/seo/pseo-types';
import { analytics } from '@client/analytics/analyticsClient';
import { ReactElement, useState } from 'react';
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

import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/MotionWrappers';

// ...

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
    <section className="py-20">
      <FadeIn>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">{title}</h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Find answers to common questions about our tool and how it works.
          </p>
        </div>
      </FadeIn>
      <StaggerContainer staggerDelay={0.05} className="max-w-3xl mx-auto space-y-6">
        {faqs.map((faq, index) => (
          <StaggerItem key={index}>
            <FAQAccordion
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => handleFAQToggle(index, faq.question)}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
