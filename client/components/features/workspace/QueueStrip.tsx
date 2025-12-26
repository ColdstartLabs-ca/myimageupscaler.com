import { IBatchItem, ProcessingStatus } from '@/shared/types/coreflow.types';
import { Dropzone } from '@client/components/features/image-processing/Dropzone';
import { cn } from '@client/utils/cn';
import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';
import React from 'react';

interface IQueueStripProps {
  queue: IBatchItem[];
  activeId: string | null;
  isProcessing: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  batchLimit?: number;
}

export const QueueStrip: React.FC<IQueueStripProps> = ({
  queue,
  activeId,
  isProcessing,
  onSelect,
  onRemove,
  onAddFiles,
  batchLimit,
}) => {
  return (
    <div
      className={cn(
        'bg-main border-t md:border-t-0 border-white/5 py-4 px-6',
        // Desktop: horizontal strip with fixed height, Mobile: vertical list that fills available space
        'h-full md:h-40 flex flex-col md:flex-row items-center gap-3 md:gap-6 overflow-y-auto md:overflow-y-hidden md:overflow-x-auto custom-scrollbar'
      )}
    >
      {/* Header - Mobile only */}
      <div className="md:hidden flex items-center justify-between mb-2">
        <h3 className="font-semibold text-white">Processing Queue</h3>
        <span className="text-sm text-muted-foreground">
          {queue.length}{' '}
          {batchLimit !== undefined && `/ ${batchLimit === Infinity ? '∞' : batchLimit}`} items
        </span>
      </div>

      {/* Add More Button */}
      <div
        className={cn(
          // Mobile: full width row, Desktop: square
          'w-full md:w-24 h-16 md:h-24 relative'
        )}
      >
        <Dropzone
          onFilesSelected={onAddFiles}
          disabled={isProcessing || (batchLimit !== undefined && queue.length >= batchLimit)}
          className={cn(
            'h-full w-full !p-0 !border-2 !border-dashed !rounded-xl transition-all duration-300',
            // Mobile: larger touch target
            'min-h-[64px] md:min-h-[96px]',
            // Disabled state styling
            isProcessing || (batchLimit !== undefined && queue.length >= batchLimit)
              ? '!border-white/5 !bg-white/5 !cursor-not-allowed'
              : '!border-white/10 hover:!bg-white/[0.08] hover:!border-accent/50'
          )}
        >
          <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none">
            <Plus
              className={cn(
                'w-5 h-5 md:w-6 md:h-6',
                isProcessing || (batchLimit !== undefined && queue.length >= batchLimit)
                  ? 'text-muted-foreground/50'
                  : 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'text-xs mt-1',
                isProcessing || (batchLimit !== undefined && queue.length >= batchLimit)
                  ? 'text-muted-foreground/50'
                  : 'text-muted-foreground'
              )}
            >
              {batchLimit !== undefined && queue.length >= batchLimit
                ? 'Limit Reached'
                : 'Add More'}
            </span>
          </div>
        </Dropzone>
      </div>

      {/* Queue Items */}
      {queue.map(item => (
        <div
          key={item.id}
          data-testid="queue-item"
          onClick={() => onSelect(item.id)}
          className={cn(
            'group relative cursor-pointer border-2 overflow-hidden transition-all duration-300 touch-manipulation',
            // Mobile: horizontal card with thumbnail, Desktop: square
            'flex flex-row md:flex-col items-center gap-3 p-2 md:p-0 md:h-24 md:w-24',
            // Responsive sizing - shrink-0 prevents flex shrinking
            'w-full h-16 md:w-24 md:h-24 shrink-0',
            // Active state
            activeId === item.id
              ? 'border-secondary ring-4 ring-secondary/20 scale-105 z-10'
              : 'border-white/5 hover:border-secondary/50',
            // Rounded corners
            'rounded-xl'
          )}
        >
          <img
            src={item.previewUrl}
            alt={`Thumbnail of queued image`}
            className={cn(
              // Mobile: small thumbnail on left, Desktop: full square
              'w-12 h-12 md:w-full md:h-full object-cover rounded-lg md:rounded-none'
            )}
            loading="lazy"
            decoding="async"
          />

          {/* Mobile Item Info */}
          <div className="flex-1 md:hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white truncate max-w-[120px]">
                {item.file.name}
              </span>
              <div className="flex items-center gap-2">
                {/* Status indicator - mobile */}
                {item.status === ProcessingStatus.COMPLETED && (
                  <div className="bg-green-500 p-0.5 rounded-full text-white">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                {item.status === ProcessingStatus.ERROR && (
                  <div className="bg-red-500 p-0.5 rounded-full text-white">
                    <AlertTriangle size={12} strokeWidth={3} />
                  </div>
                )}
                {item.status === ProcessingStatus.PROCESSING && (
                  <div className="bg-accent p-0.5 rounded-full text-white animate-spin">
                    <Loader2 size={12} />
                  </div>
                )}
                {/* Remove button - mobile */}
                {!isProcessing && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="p-2 -mr-1 text-muted-foreground hover:text-red-400 active:text-red-500 active:bg-red-500/20 rounded-lg transition-colors touch-manipulation"
                    aria-label="Remove image"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
            {/* Progress bar - mobile */}
            <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
              {item.status === ProcessingStatus.COMPLETED ? (
                <div className="h-full bg-emerald-500 w-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              ) : item.status === ProcessingStatus.ERROR ? (
                <div className="h-full bg-red-500 w-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              ) : (
                <div
                  className="h-full bg-gradient-to-r from-accent to-secondary transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  style={{ width: `${item.progress}%` }}
                ></div>
              )}
            </div>
          </div>

          {/* Desktop Status Indicators (overlay on image) */}
          <div className="hidden md:block absolute inset-0">
            {/* Remove Button (Hover) - Desktop only */}
            {!isProcessing && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:scale-110"
              >
                <X size={14} />
              </button>
            )}

            {/* Status Indicators - Desktop */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5">
              {item.status === ProcessingStatus.COMPLETED ? (
                <div className="h-full bg-emerald-500 w-full shadow-[0_-2px_8px_rgba(16,185,129,0.5)]"></div>
              ) : item.status === ProcessingStatus.ERROR ? (
                <div className="h-full bg-red-500 w-full shadow-[0_-2px_8px_rgba(239,68,68,0.5)]"></div>
              ) : (
                <div
                  className="h-full bg-gradient-to-r from-accent to-secondary transition-all duration-300 shadow-[0_-2px_8px_rgba(59,130,246,0.5)]"
                  style={{ width: `${item.progress}%` }}
                ></div>
              )}
            </div>

            {/* Status Icon Overlay - Desktop */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {item.status === ProcessingStatus.COMPLETED && (
                <div className="bg-emerald-500/90 p-1.5 rounded-full text-white shadow-lg shadow-emerald-500/20 scale-110">
                  <Check size={14} strokeWidth={4} />
                </div>
              )}
              {item.status === ProcessingStatus.ERROR && (
                <div className="bg-red-500/90 p-1.5 rounded-full text-white shadow-lg shadow-red-500/20 scale-110">
                  <AlertTriangle size={14} strokeWidth={4} />
                </div>
              )}
              {item.status === ProcessingStatus.PROCESSING && (
                <div className="bg-accent/60 p-2 rounded-full text-white shadow-lg shadow-accent/20 animate-spin backdrop-blur-sm">
                  <Loader2 size={16} />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
