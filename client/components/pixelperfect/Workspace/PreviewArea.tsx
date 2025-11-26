import React from 'react';
import { Check, Layers, AlertTriangle } from 'lucide-react';
import ImageComparison from '@client/components/pixelperfect/ImageComparison';
import Button from '@client/components/pixelperfect/Button';
import { IBatchItem, ProcessingStatus } from '@shared/types/pixelperfect';

interface IPreviewAreaProps {
  activeItem: IBatchItem | null;
  onDownload: (url: string, filename: string) => void;
  onRetry: (item: IBatchItem) => void;
}

const PreviewArea: React.FC<IPreviewAreaProps> = ({ activeItem, onDownload, onRetry }) => {
  if (!activeItem) {
    return (
      <div className="text-slate-400 flex flex-col items-center">
        <Layers size={48} className="mb-4 opacity-50" />
        <p>Select an image from the queue below</p>
      </div>
    );
  }

  if (activeItem.status === ProcessingStatus.COMPLETED && activeItem.processedUrl) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="mb-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-medium text-slate-900">{activeItem.file.name}</h3>
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check size={12} /> Processing Complete
            </span>
          </div>
        </div>
        <div className="flex-grow relative min-h-0">
          <ImageComparison
            beforeUrl={activeItem.previewUrl}
            afterUrl={activeItem.processedUrl}
            onDownload={() => onDownload(activeItem.processedUrl!, activeItem.file.name)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <img
        src={activeItem.previewUrl}
        alt={`Preview of ${activeItem.file.name}`}
        className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
        loading="eager"
        decoding="async"
      />

      {/* Processing Overlay */}
      {activeItem.status === ProcessingStatus.PROCESSING && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg">
          <div className="w-64 space-y-4 p-6 bg-white rounded-xl shadow-2xl border border-slate-100">
            <div className="flex justify-between text-sm font-medium text-slate-900">
              <span>Enhancing...</span>
              <span>{activeItem.progress}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${activeItem.progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {activeItem.status === ProcessingStatus.ERROR && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl shadow-xl border border-red-100 text-center max-w-md">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Processing Failed</h3>
            <p className="text-slate-600 mb-4">{activeItem.error}</p>
            <Button size="sm" onClick={() => onRetry(activeItem)}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default PreviewArea;
