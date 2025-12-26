'use client';

import React from 'react';

interface IAmbientBackgroundProps {
  variant?: 'hero' | 'section' | 'subtle';
}

export const AmbientBackground: React.FC<IAmbientBackgroundProps> = ({ variant = 'hero' }) => {
  if (variant === 'hero') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Violet orb - top right */}
        <div
          className="ambient-orb ambient-orb-violet animate-orb-1 w-[500px] h-[500px]"
          style={{ top: '-10%', right: '-5%' }}
        />
        {/* Blue orb - center left */}
        <div
          className="ambient-orb ambient-orb-blue animate-orb-2 w-[600px] h-[600px]"
          style={{ top: '20%', left: '-15%' }}
        />
        {/* Teal orb - bottom */}
        <div
          className="ambient-orb ambient-orb-teal animate-orb-3 w-[400px] h-[400px]"
          style={{ bottom: '-5%', right: '20%' }}
        />
      </div>
    );
  }

  if (variant === 'section') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="ambient-orb ambient-orb-violet animate-orb-2 w-[300px] h-[300px] opacity-30"
          style={{ top: '10%', right: '10%' }}
        />
      </div>
    );
  }

  return null;
};
