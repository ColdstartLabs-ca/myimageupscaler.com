'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const AmbientBackground = dynamic(
  () => import('@client/components/landing/AmbientBackground').then(m => m.AmbientBackground),
  { ssr: false }
);

export interface ILandingSectionProps {
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  ambient?: boolean;
  fadeTop?: boolean;
  fadeBottom?: boolean;
  overlay?: ReactNode;
}

/**
 * Standard landing page section wrapper — consistent overflow, z-index, and
 * optional ambient/fade layers so adjacent blocks blend without hard seams.
 */
export function LandingSection({
  id,
  className = '',
  innerClassName = '',
  children,
  ambient = false,
  fadeTop = false,
  fadeBottom = false,
  overlay,
}: ILandingSectionProps): JSX.Element {
  return (
    <section
      id={id}
      className={[
        'landing-section relative overflow-x-hidden',
        fadeTop && 'landing-section-fade-top',
        fadeBottom && 'landing-section-fade-bottom',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {ambient && <AmbientBackground variant="section" />}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
          {overlay}
        </div>
      )}
      <div className={['relative z-10', innerClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
