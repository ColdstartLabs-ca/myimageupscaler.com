/**
 * Benefits Section Component
 * Based on PRD-PSEO-05: Component Library
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/MotionWrappers';
import type { IBenefit } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';
import { BenefitCard } from '../ui/BenefitCard';

interface IBenefitsSectionProps {
  benefits: IBenefit[];
  title?: string;
  subtitle?: string;
}

export function BenefitsSection({
  benefits,
  title = 'Why Choose Us',
  subtitle = 'See the difference our AI-powered technology makes for your images',
}: IBenefitsSectionProps): ReactElement {
  if (!benefits || benefits.length === 0) {
    return <></>;
  }

  return (
    <section className="py-20">
      <FadeIn>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">{title}</h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>
      <StaggerContainer staggerDelay={0.1} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {benefits.map((benefit, index) => (
          <StaggerItem key={index}>
            <BenefitCard benefit={benefit} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
