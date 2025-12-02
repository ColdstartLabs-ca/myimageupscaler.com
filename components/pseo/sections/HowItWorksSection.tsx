/**
 * How It Works Section Component
 * Based on PRD-PSEO-05: Component Library
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/MotionWrappers';
import type { IHowItWorksStep } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';
import { StepCard } from '../ui/StepCard';

interface IHowItWorksSectionProps {
  steps: IHowItWorksStep[];
  title?: string;
  subtitle?: string;
}

export function HowItWorksSection({
  steps,
  title = 'How It Works',
  subtitle = 'Get professional results in just a few simple steps',
}: IHowItWorksSectionProps): ReactElement {
  if (!steps || steps.length === 0) {
    return <></>;
  }

  return (
    <section className="py-20 bg-gradient-to-b from-slate-50 to-white rounded-2xl my-20">
      <FadeIn>
        <div className="text-center mb-16 px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">{title}</h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>
      <StaggerContainer staggerDelay={0.15} className="max-w-3xl mx-auto px-6">
        {steps.map((step, index) => (
          <StaggerItem key={index}>
            <StepCard step={step} isLast={index === steps.length - 1} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
