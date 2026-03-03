import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Download, ZoomIn, ZoomOut } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@client/components/ui/Button';
import { canShowPrompt, markPromptShown } from '@client/utils/promptFrequency';
import type { IPromptFrequencyConfig } from '@client/utils/promptFrequency';
import { analytics } from '@client/analytics/analyticsClient';

const AFTER_COMPARISON_FREQ_CONFIG: IPromptFrequencyConfig = {
  key: 'prompt_freq_after_comparison',
  cooldownMs: 48 * 60 * 60 * 1000,
};

interface IImageComparisonProps {
  beforeUrl: string;
  afterUrl: string;
  onDownload: () => void;
  /** Whether the after image has transparency (e.g., from bg-removal). Auto-detected from blob: URLs if not provided. */
  hasTransparency?: boolean;
}

export const ImageComparison: React.FC<IImageComparisonProps> = ({
  beforeUrl,
  afterUrl,
  onDownload,
  hasTransparency,
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showComparisonNudge, setShowComparisonNudge] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-detect transparency from blob URL if not explicitly provided
  // Blob URLs indicate client-side processing (e.g., bg-removal) which produces transparent PNGs
  const showTransparency = hasTransparency ?? afterUrl.startsWith('blob:');

  // Show upgrade nudge once after the user has moved the comparison slider,
  // subject to cross-session frequency capping (48-hour cooldown).
  useEffect(() => {
    if (!isDragging && sliderPosition !== 50) {
      if (canShowPrompt(AFTER_COMPARISON_FREQ_CONFIG)) {
        setShowComparisonNudge(true);
        markPromptShown(AFTER_COMPARISON_FREQ_CONFIG);
        analytics.track('upgrade_prompt_shown', { trigger: 'after_comparison' });
      }
    }
  }, [isDragging, sliderPosition]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent | React.MouseEvent | TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX =
        'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

      setSliderPosition(percentage);
    },
    [isDragging]
  );

  // Global event listeners for dragging outside the container
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

  const toggleZoom = () => {
    setZoom(prev => (prev === 1 ? 2 : 1));
  };

  return (
    <div className="w-full h-full max-w-6xl mx-auto bg-surface rounded-xl shadow-lg overflow-hidden border border-border flex flex-col">
      <div className="p-3 md:p-4 border-b border-border flex flex-wrap md:flex-nowrap justify-between items-center gap-2 shrink-0">
        <div className="flex items-center">
          <span className="inline-flex items-center px-2 md:px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success whitespace-nowrap">
            ✓ Enhanced
          </span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={toggleZoom}
            className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
            title="Toggle Zoom"
          >
            {zoom === 1 ? <ZoomIn size={18} /> : <ZoomOut size={18} />}
          </button>
          <Button variant="primary" size="sm" icon={<Download size={16} />} onClick={onDownload}>
            <span className="hidden sm:inline">Download Result</span>
            <span className="sm:hidden">Download</span>
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full flex-grow bg-checkerboard overflow-hidden cursor-col-resize select-none group"
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {/* Images container with zoom support */}
        <div
          className={`relative w-full h-full transition-transform duration-300 ease-in-out origin-center flex items-center justify-center ${showTransparency ? 'bg-checkerboard' : 'bg-surface-light'}`}
          style={{ transform: `scale(${zoom})` }}
        >
          {/* After Image (Background) - with checkerboard if transparent */}
          <div
            className={`absolute top-0 left-0 w-full h-full ${showTransparency ? 'bg-checkerboard' : ''}`}
          >
            <img
              src={afterUrl}
              alt="Enhanced image result"
              className="absolute top-0 left-0 w-full h-full object-contain object-center select-none"
              draggable={false}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>

          {/* Before Image (Foreground - Clipped) */}
          <div
            className="absolute top-0 left-0 w-full h-full select-none overflow-hidden bg-surface-light"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <img
              src={beforeUrl}
              alt="Original image for comparison"
              className="absolute top-0 left-0 w-full h-full object-contain object-center"
              draggable={false}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>

        {/* Slider Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-surface shadow-[0_0_10px_rgba(var(--color-text-primary),0.3)] cursor-col-resize flex items-center justify-center z-10 transform -translate-x-1/2"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="w-8 h-8 bg-surface rounded-full shadow-lg flex items-center justify-center">
            <ArrowLeftRight size={16} className="text-accent" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Original
        </div>
        <div className="absolute bottom-4 right-4 bg-accent/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Enhanced
        </div>
      </div>

      {showComparisonNudge && (
        <div className="px-4 py-2 border-t border-border text-center text-xs text-text-muted">
          Unlock premium models for even sharper results.{' '}
          <Link href="/dashboard/billing" className="text-accent hover:underline font-medium">
            Upgrade now
          </Link>
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default ImageComparison;
