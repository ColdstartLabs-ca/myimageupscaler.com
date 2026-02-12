'use client';

import React from 'react';
import { BeforeAfterSlider } from '../ui/BeforeAfterSlider';

export const HeroBeforeAfter: React.FC = () => {
  return (
    <div className="glass-card-2025 p-2 animated-border-violet rounded-2xl max-w-3xl mx-auto">
      <BeforeAfterSlider
        beforeUrl="/before-after/bird-before-v2.webp"
        afterUrl="/before-after/bird-after-v2.webp"
        beforeLabel="Original"
        afterLabel="Enhanced"
        className="aspect-[16/10] rounded-xl"
      />
    </div>
  );
};
