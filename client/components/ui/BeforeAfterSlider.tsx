'use client';

import { ArrowLeftRight } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface IBeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  aspectRatio?: string;
}

export const BeforeAfterSlider: React.FC<IBeforeAfterSliderProps> = ({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
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
      style={{ aspectRatio }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {/* After Image (Background) */}
      <img
        src={afterUrl}
        alt={afterLabel}
        className="w-full h-full object-cover select-none"
        draggable={false}
        loading="eager"
        fetchPriority="high"
      />

      {/* Before Image (Foreground - Clipped) */}
      <div
        className="absolute top-0 left-0 w-full h-full select-none overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="w-full h-full object-cover"
          draggable={false}
          loading="eager"
          fetchPriority="high"
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
      <div className="absolute bottom-3 left-3 glass-strong text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none font-medium">
        {beforeLabel}
      </div>
      <div className="absolute bottom-3 right-3 gradient-cta text-white text-xs px-3 py-1.5 rounded-lg pointer-events-none font-medium shadow-lg shadow-accent/20">
        {afterLabel}
      </div>
    </div>
  );
};
