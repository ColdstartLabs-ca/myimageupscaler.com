'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Check, Lock, Image as ImageIcon } from 'lucide-react';
import { QualityTier, QUALITY_TIER_CONFIG, IPreviewImages } from '@/shared/types/coreflow.types';
import { cn } from '@client/utils/cn';

export interface IModelCardProps {
  tier: QualityTier;
  config: (typeof QUALITY_TIER_CONFIG)[QualityTier];
  isSelected: boolean;
  isLocked: boolean;
  onSelect: (tier: QualityTier) => void;
  onLockedClick?: () => void;
}

/**
 * Individual model card displaying before/after preview thumbnails,
 * model name, use cases, and credit cost.
 * Supports selected and locked states with visual overlays.
 */
export const ModelCard: React.FC<IModelCardProps> = ({
  tier,
  config,
  isSelected,
  isLocked,
  onSelect,
  onLockedClick,
}) => {
  const handleClick = () => {
    if (isLocked) {
      onLockedClick?.();
    } else {
      onSelect(tier);
    }
  };

  const formatCredits = (credits: number | 'variable'): string => {
    if (credits === 'variable') {
      return '1-4 CR';
    }
    return `${credits} CR`;
  };

  const isAuto = tier === 'auto';
  const hasPreviewImages = config.previewImages !== null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        // Base styles
        'group relative w-full rounded-xl border transition-all duration-300 text-left overflow-hidden',
        'focus:outline-none focus:ring-2 focus:ring-accent/50',
        // Default state
        'bg-white/[0.03] border-border hover:border-white/20 hover:bg-white/[0.06]',
        // Selected state
        isSelected && 'border-accent/50 bg-accent/10',
        isSelected && (isAuto ? 'shadow-glow-mixed' : 'shadow-glow-blue'),
        // Locked state
        isLocked && 'opacity-60 grayscale-[0.3] hover:grayscale-0 hover:opacity-80'
      )}
    >
      {/* Preview Images Section */}
      <div className="relative aspect-[2/1] overflow-hidden">
        {hasPreviewImages ? (
          config.previewImages!.displayMode === 'static' ? (
            <StaticThumbnail previewImages={config.previewImages!} tierLabel={config.label} />
          ) : config.previewImages!.displayMode === 'flip' ? (
            <FlipThumbnail previewImages={config.previewImages!} tierLabel={config.label} />
          ) : (
            <BeforeAfterThumbnails previewImages={config.previewImages!} tierLabel={config.label} />
          )
        ) : (
          <PlaceholderGradient tier={config.label} />
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-lg">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}

        <TierBadge badge={config.badge} />

        {/* Locked badge - top-left corner */}
        {isLocked && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-full pointer-events-none z-10">
            <Lock className="w-2.5 h-2.5 text-secondary" />
            <span className="text-[8px] font-bold text-secondary uppercase tracking-wide">
              Pro only
            </span>
          </div>
        )}
      </div>

      {/* Card Content Section */}
      <div className="px-3 py-2.5">
        {/* Header row: Name + Credit badge */}
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                'font-bold text-xs truncate transition-colors',
                isSelected ? (isAuto ? 'text-secondary' : 'text-accent') : 'text-white'
              )}
            >
              {config.label}
            </span>
            {isAuto && (
              <span className="text-[7px] bg-secondary/30 text-secondary-light px-1 py-px rounded-full font-black border border-secondary/30 uppercase tracking-tighter shrink-0">
                Smart
              </span>
            )}
          </div>

          {/* Credit badge */}
          <div
            className={cn(
              'text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-md border shrink-0',
              isSelected
                ? isAuto
                  ? 'text-secondary bg-black/30 border-secondary/40'
                  : 'text-accent bg-black/30 border-accent/40'
                : 'text-text-muted bg-black/20 border-white/10'
            )}
          >
            {formatCredits(config.credits)}
          </div>
        </div>

        {/* Best for description */}
        <p
          className={cn(
            'text-[10px] font-medium line-clamp-1 transition-colors',
            isSelected ? 'text-white/80' : 'text-text-secondary'
          )}
        >
          {config.bestFor}
        </p>
      </div>
    </button>
  );
};

/**
 * Renders before/after images with a draggable comparison slider.
 * Falls back to PlaceholderGradient if either image fails to load.
 */
const BeforeAfterThumbnails: React.FC<{ previewImages: IPreviewImages; tierLabel: string }> = ({
  previewImages,
  tierLabel,
}) => {
  const [hasError, setHasError] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  // Only the handle captures pointer — tapping images scrolls normally
  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      hasMoved.current = true;
      setIsSliding(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handleHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      e.stopPropagation();
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handleHandlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    setIsSliding(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Desktop: track mouse for zoom
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setZoomOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const handleImageLoad = useCallback(() => setLoadedCount(c => c + 1), []);
  const isLoaded = loadedCount >= 2;

  const shouldZoom = isHovering && !isSliding;
  const objPos = previewImages.objectPosition ?? 'center';
  const imgStyle: React.CSSProperties = shouldZoom
    ? {
        objectPosition: objPos,
        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
        transform: 'scale(2.2)',
        transition: 'transform 0.15s ease-out',
      }
    : { objectPosition: objPos, transform: 'scale(1)', transition: 'transform 0.2s ease-out' };

  if (hasError) {
    return <PlaceholderGradient tier={tierLabel} />;
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Loading skeleton */}
      {!isLoaded && <div className="absolute inset-0 z-[1] bg-white/[0.06] animate-pulse" />}

      {/* Before image (full width, base layer) */}
      <img
        src={previewImages.before}
        alt="Before"
        className={cn(
          'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        style={imgStyle}
        loading="lazy"
        draggable={false}
        onLoad={handleImageLoad}
        onError={() => setHasError(true)}
      />

      {/* After image (clipped to slider position) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
      >
        <img
          src={previewImages.after}
          alt="After"
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          style={imgStyle}
          loading="lazy"
          draggable={false}
          onLoad={handleImageLoad}
          onError={() => setHasError(true)}
        />
      </div>

      {/* Slider line */}
      <div
        className={cn(
          'absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{ left: `${sliderPos}%` }}
      />

      {/* Draggable handle — only this element captures pointer */}
      <div
        className={cn(
          'absolute top-0 bottom-0 z-10 cursor-ew-resize touch-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ left: `${sliderPos}%`, width: '28px', marginLeft: '-14px' }}
        onPointerDown={handleHandlePointerDown}
        onPointerMove={handleHandlePointerMove}
        onPointerUp={handleHandlePointerUp}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-lg flex items-center justify-center">
          <div className="flex gap-px">
            <div className="w-px h-2 bg-black/40" />
            <div className="w-px h-2 bg-black/40" />
          </div>
        </div>
      </div>

      {/* Labels */}
      <div
        className={cn(
          'absolute bottom-1.5 left-1.5 text-[7px] font-bold text-white bg-black/60 px-1 py-0.5 rounded uppercase tracking-wider pointer-events-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
      >
        Before
      </div>
      <div
        className={cn(
          'absolute bottom-1.5 right-1.5 text-[7px] font-bold text-white bg-accent/80 px-1 py-0.5 rounded uppercase tracking-wider pointer-events-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
      >
        After
      </div>
    </div>
  );
};

/**
 * Renders after image by default, crossfades to before on hover.
 * Used for transformation models where compositions differ significantly.
 */
const FlipThumbnail: React.FC<{ previewImages: IPreviewImages; tierLabel: string }> = ({
  previewImages,
  tierLabel,
}) => {
  const [hasError, setHasError] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const handleImageLoad = useCallback(() => setLoadedCount(c => c + 1), []);
  const isLoaded = loadedCount >= 2;

  if (hasError) {
    return <PlaceholderGradient tier={tierLabel} />;
  }

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {!isLoaded && <div className="absolute inset-0 z-[1] bg-white/[0.06] animate-pulse" />}

      {/* After image (default view) */}
      <img
        src={previewImages.after}
        alt="After"
        className={cn(
          'absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300',
          isLoaded ? (isHovering ? 'opacity-0' : 'opacity-100') : 'opacity-0'
        )}
        loading="lazy"
        draggable={false}
        onLoad={handleImageLoad}
        onError={() => setHasError(true)}
      />

      {/* Before image (revealed on hover) */}
      <img
        src={previewImages.before}
        alt="Before"
        className={cn(
          'absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300',
          isLoaded ? (isHovering ? 'opacity-100' : 'opacity-0') : 'opacity-0'
        )}
        loading="lazy"
        draggable={false}
        onLoad={handleImageLoad}
        onError={() => setHasError(true)}
      />

      {/* Label */}
      <div
        className={cn(
          'absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wider pointer-events-none transition-all duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
          isHovering ? 'bg-black/60' : 'bg-accent/80'
        )}
      >
        {isHovering ? 'Before' : 'After'}
      </div>
    </div>
  );
};

/**
 * Renders a single static image with no interaction.
 */
const StaticThumbnail: React.FC<{ previewImages: IPreviewImages; tierLabel: string }> = ({
  previewImages,
  tierLabel,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const objPos = previewImages.objectPosition ?? 'center';

  if (hasError) {
    return <PlaceholderGradient tier={tierLabel} />;
  }

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {!isLoaded && <div className="absolute inset-0 z-[1] bg-white/[0.06] animate-pulse" />}
      <img
        src={previewImages.before}
        alt={tierLabel}
        className={cn(
          'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{ objectPosition: objPos }}
        loading="lazy"
        draggable={false}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
};

/**
 * Small pill badge displayed in the top-right corner of a model card preview.
 * Shows "Popular" (amber) or "Recommended" (green) based on the badge type.
 */
const TierBadge: React.FC<{ badge: 'popular' | 'recommended' | null | undefined }> = ({
  badge,
}) => {
  if (!badge) return null;
  return (
    <div
      className={cn(
        'absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide pointer-events-none z-10',
        badge === 'popular' ? 'bg-amber-500/90 text-white' : 'bg-emerald-500/90 text-white'
      )}
    >
      {badge === 'popular' ? 'Popular' : 'Recommended'}
    </div>
  );
};

/**
 * Renders a placeholder gradient when no preview images are available
 */
const PlaceholderGradient: React.FC<{ tier: string }> = ({ tier }) => (
  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.02] flex flex-col items-center justify-center gap-1.5">
    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
      <ImageIcon className="w-4 h-4 text-text-muted" />
    </div>
    <span className="text-[10px] font-medium text-text-muted">{tier}</span>
  </div>
);
