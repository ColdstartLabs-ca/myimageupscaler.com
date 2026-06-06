'use client';

import type { ReactNode } from 'react';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';

interface ILandingHeroShellProps {
  children: ReactNode;
}

/**
 * Shared backdrop for hero + creators — one gradient and ambient layer
 * so there is no visible seam between adjacent sections.
 */
export function LandingHeroShell({ children }: ILandingHeroShellProps): JSX.Element {
  return (
    <div className="landing-hero-shell relative overflow-x-hidden hero-gradient-2025">
      <AmbientBackground variant="hero" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
