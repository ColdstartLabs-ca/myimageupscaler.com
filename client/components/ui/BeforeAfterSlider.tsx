'use client';

import { ArrowLeftRight } from 'lucide-react';
import Image from 'next/image';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface IBeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeMeta?: string;
  afterMeta?: string;
  badgeLabel?: string;
  labelPosition?: 'top' | 'bottom';
  className?: string;
  /** Pass `null` when the slider fills a pre-sized parent (e.g. hero overlay). */
  aspectRatio?: string | null;
}

export const BeforeAfterSlider: React.FC<IBeforeAfterSliderProps> = ({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
  beforeMeta,
  afterMeta,
  badgeLabel,
  labelPosition = 'bottom',
  className = '',
  aspectRatio = '16/9',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Cache the rect to avoid repeated getBoundingClientRect calls during drag
  const rectRef = useRef<DOMRect | null>(null);

  const handleMouseDown = useCallback(() => {
    // Cache the rect when drag starts to avoid layout thrashing
    if (containerRef.current) {
      rectRef.current = containerRef.current.getBoundingClientRect();
    }
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    rectRef.current = null;
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent | React.MouseEvent | TouchEvent) => {
      if (!isDragging || !rectRef.current) return;

      const rect = rectRef.current;
      const clientX =
        'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

      setSliderPosition(percentage);
    },
    [isDragging]
  );

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.addEventListener('touchmove', handleMouseMove as any);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.removeEventListener('touchmove', handleMouseMove as any);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden cursor-col-resize select-none rounded-lg ${className}`}
      style={aspectRatio === null ? undefined : { aspectRatio }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {/* After Image (Background) */}
      <Image
        src={afterUrl}
        alt={afterLabel}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover select-none"
        draggable={false}
        priority
      />

      {/* Before Image (Foreground - Clipped) */}
      <div
        className="absolute top-0 left-0 w-full h-full select-none overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <Image
          src={beforeUrl}
          alt={beforeLabel}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          draggable={false}
          priority
        />
      </div>

      {/* Slider Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] cursor-col-resize flex items-center justify-center z-10 transform -translate-x-1/2"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="w-10 h-10 gradient-cta rounded-full shadow-xl shadow-black/30 flex items-center justify-center border-2 border-white">
          <ArrowLeftRight size={14} className="text-white" />
        </div>
      </div>

      {/* Labels */}
      <div
        className={`absolute left-3 glass-strong text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none font-medium ${
          labelPosition === 'top' ? 'top-3' : 'bottom-3'
        }`}
      >
        <div>{beforeLabel}</div>
        {beforeMeta && <div className="mt-1 font-normal text-white/90">{beforeMeta}</div>}
      </div>
      <div
        className={`absolute right-3 text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none font-medium shadow-lg ${
          labelPosition === 'top' ? 'top-3 glass-strong' : 'bottom-3 gradient-cta shadow-accent/20'
        }`}
      >
        <div>{afterLabel}</div>
        {afterMeta && <div className="mt-1 font-normal text-white/90">{afterMeta}</div>}
      </div>
      {badgeLabel && (
        <div className="absolute bottom-4 right-4 glass-strong text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none font-semibold">
          {badgeLabel}
        </div>
      )}
    </div>
  );
};
