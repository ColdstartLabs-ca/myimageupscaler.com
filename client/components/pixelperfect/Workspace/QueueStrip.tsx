import { IBatchItem, ProcessingStatus } from '@shared/types/pixelperfect';
import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';
import React from 'react';
import Dropzone from '@client/components/pixelperfect/Dropzone';

interface IQueueStripProps {
  queue: IBatchItem[];
  activeId: string | null;
  isProcessing: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
}

const QueueStrip: React.FC<IQueueStripProps> = ({
  queue,
  activeId,
  isProcessing,
  onSelect,
  onRemove,
  onAddFiles,
}) => {
  return (
    <div className="h-32 bg-white border-t border-slate-200 p-4 flex gap-4 overflow-x-auto overflow-y-hidden custom-scrollbar shrink-0 items-center">
      {/* Add More Button */}
      <div className="shrink-0 h-24 w-24 relative">
        <Dropzone
          onFilesSelected={onAddFiles}
          disabled={isProcessing}
          className="h-full w-full !p-0 !border-2 !border-dashed !border-slate-300 hover:!bg-slate-100 !rounded-lg"
        >
          <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none">
            <Plus size={24} className="text-slate-400" />
            <span className="text-xs text-slate-500 mt-1">Add</span>
          </div>
        </Dropzone>
      </div>

      {/* Queue Items */}
      {queue.map(item => (
        <div
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`
              group relative h-24 w-24 shrink-0 rounded-lg cursor-pointer border-2 overflow-hidden transition-all
              ${activeId === item.id ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}
            `}
        >
          <img
            src={item.previewUrl}
            alt={`Thumbnail of queued image`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />

          {/* Remove Button (Hover) */}
          {!isProcessing && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            >
              <X size={12} />
            </button>
          )}

          {/* Status Indicators */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200">
            {item.status === ProcessingStatus.COMPLETED ? (
              <div className="h-full bg-green-500 w-full"></div>
            ) : item.status === ProcessingStatus.ERROR ? (
              <div className="h-full bg-red-500 w-full"></div>
            ) : (
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              ></div>
            )}
          </div>

          {/* Status Icon Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {item.status === ProcessingStatus.COMPLETED && (
              <div className="bg-green-500/80 p-1 rounded-full text-white shadow-sm">
                <Check size={14} strokeWidth={3} />
              </div>
            )}
            {item.status === ProcessingStatus.ERROR && (
              <div className="bg-red-500/80 p-1 rounded-full text-white shadow-sm">
                <AlertTriangle size={14} strokeWidth={3} />
              </div>
            )}
            {item.status === ProcessingStatus.PROCESSING && (
              <div className="bg-indigo-900/50 p-1 rounded-full text-white shadow-sm animate-spin">
                <Loader2 size={14} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default QueueStrip;
