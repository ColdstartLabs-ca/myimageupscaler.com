/**
 * Use Cases Section Component
 * Based on PRD-PSEO-05: Component Library
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/app/(pseo)/_components/ui/MotionWrappers';
import type { IUseCase } from '@/lib/seo/pseo-types';
import { ReactElement } from 'react';
import { UseCaseCard } from '../ui/UseCaseCard';

interface IUseCasesSectionProps {
  useCases: IUseCase[];
  title?: string;
  subtitle?: string;
}

export function UseCasesSection({
  useCases,
  title = 'Perfect For',
  subtitle = 'Discover how professionals use our tool to achieve stunning results',
}: IUseCasesSectionProps): ReactElement {
  if (!useCases || useCases.length === 0) {
    return <></>;
  }

  return (
    <section className="py-20">
      <FadeIn>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">{title}</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>
      <StaggerContainer staggerDelay={0.12} className="grid md:grid-cols-2 gap-8">
        {useCases.map((useCase, index) => (
          <StaggerItem key={index}>
            <UseCaseCard useCase={useCase} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
