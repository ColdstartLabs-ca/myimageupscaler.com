'use client';

import React from 'react';

interface IAmbientBackgroundProps {
  variant?: 'hero' | 'section' | 'subtle';
}

export const AmbientBackground: React.FC<IAmbientBackgroundProps> = ({ variant = 'hero' }) => {
  if (variant === 'hero') {
    return (
      <div className="absolute inset-0 pointer-events-none">
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
          style={{ bottom: '-20%', right: '10%' }}
        />
      </div>
    );
  }

  if (variant === 'section') {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="ambient-orb ambient-orb-violet animate-orb-2 w-[500px] h-[500px] opacity-30"
          style={{ top: '10%', right: '10%' }}
        />
      </div>
    );
  }

  return null;
};
