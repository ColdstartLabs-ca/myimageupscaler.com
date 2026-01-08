/**
 * Features Section Component
 * Based on PRD-PSEO-05 Section 3.2: Features Section
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { IFeature } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';
import { FeatureCard } from '../ui/FeatureCard';

interface IFeaturesSectionProps {
  features: IFeature[];
  title?: string;
  subtitle?: string;
}

export function FeaturesSection({
  features,
  title = 'Powerful Features',
  subtitle = 'Everything you need to transform your images with professional-quality results',
}: IFeaturesSectionProps): ReactElement {
  if (!features || features.length === 0) {
    return <></>;
  }

  return (
    <section className="py-20">
      <FadeIn>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">{title}</h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>
      <StaggerContainer staggerDelay={0.1} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <StaggerItem key={index}>
            <FeatureCard feature={feature} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
