'use client';

import React from 'react';
import { BeforeAfterSlider } from '../ui/BeforeAfterSlider';
import { HERO_COMPARISON_IMAGES } from './heroAssets';

export const HeroBeforeAfter: React.FC = () => {
  return (
    <BeforeAfterSlider
      beforeUrl={HERO_COMPARISON_IMAGES.before}
      afterUrl={HERO_COMPARISON_IMAGES.after}
      beforeLabel="Before"
      afterLabel="After"
      beforeMeta="800 x 600"
      afterMeta="3200 x 2400"
      badgeLabel="4x Upscale"
      labelPosition="top"
      className="aspect-[4/3] rounded-xl h-full"
      aspectRatio="4/3"
    />
  );
};
