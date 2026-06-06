'use client';

import React from 'react';

interface IAmbientBackgroundProps {
  variant?: 'hero' | 'section' | 'subtle';
}

export const AmbientBackground: React.FC<IAmbientBackgroundProps> = ({ variant = 'hero' }) => {
  if (variant === 'hero') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_72%,transparent_100%)]">
        {/* Violet orb - top right */}
        <div
          className="ambient-orb ambient-orb-violet animate-orb-1 w-[800px] h-[800px]"
          style={{ top: '-20%', right: '-20%' }}
        />
        {/* Blue orb - center left */}
        <div
          className="ambient-orb ambient-orb-blue animate-orb-2 w-[900px] h-[900px]"
          style={{ top: '10%', left: '-30%' }}
        />
        {/* Teal orb - bottom */}
        <div
          className="ambient-orb ambient-orb-teal animate-orb-3 w-[700px] h-[700px]"
          style={{ bottom: '-10%', right: '10%' }}
        />
      </div>
    );
  }

  if (variant === 'section') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_78%,transparent_100%)]">
        <div
          className="ambient-orb ambient-orb-violet animate-orb-2 h-[480px] w-[480px] opacity-[0.18]"
          style={{ top: '38%', right: '8%' }}
        />
        <div
          className="ambient-orb ambient-orb-blue animate-orb-3 h-[420px] w-[420px] opacity-[0.12]"
          style={{ top: '55%', left: '-12%' }}
        />
      </div>
    );
  }

  return null;
};
