'use client';

import React from 'react';
import { BeforeAfterSlider } from '../ui/BeforeAfterSlider';

export const HeroBeforeAfter: React.FC = () => {
  return (
    <BeforeAfterSlider
      beforeUrl="/before-after/bird-before-v2.webp"
      afterUrl="/before-after/bird-after-v2.webp"
      beforeLabel="Original"
      afterLabel="Enhanced"
      className="aspect-[16/10] rounded-xl h-full"
    />
  );
};
