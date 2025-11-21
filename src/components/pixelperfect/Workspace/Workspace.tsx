import React, { useState } from 'react';
import Dropzone from '../Dropzone';
import { CheckCircle2, Layers } from 'lucide-react';
import { useBatchQueue } from '@/hooks/pixelperfect/useBatchQueue';
import { IUpscaleConfig } from '@/types/pixelperfect';
import BatchSidebar from './BatchSidebar';
import PreviewArea from './PreviewArea';
import QueueStrip from './QueueStrip';
import { downloadSingle } from '@/lib/pixelperfect/download';

const Workspace: React.FC = () => {
  // Hook managing all queue state
  const { 
    queue, 
    activeId, 
    activeItem, 
    isProcessingBatch, 
    completedCount,
    setActiveId, 
    addFiles, 
    removeItem, 
    clearQueue, 
    processBatch,
    processSingleItem
  } = useBatchQueue();

  // Config State
  const [config, setConfig] = useState<IUpscaleConfig>({
    mode: 'both',
    scale: 2,
    enhanceFace: false,
    preserveText: true,
    denoise: true
  });

  // Handlers
  const handleDownloadSingle = (url: string, filename: string) => {
    downloadSingle(url, filename, config.mode);
  };

  // Empty State
  if (queue.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-8 sm:p-16 flex-grow flex flex-col justify-center">
          <Dropzone onFilesSelected={addFiles} />
          <div className="mt-8 flex justify-center gap-8 text-slate-400 flex-wrap">
              <div className="flex items-center gap-2"><CheckCircle2 size={16} /> No signup required</div>
              <div className="flex items-center gap-2"><CheckCircle2 size={16} /> Free 5MB limit</div>
              <div className="flex items-center gap-2"><CheckCircle2 size={16} /> No Watermark</div>
              <div className="flex items-center gap-2 text-indigo-500"><Layers size={16} /> Batch Supported</div>
          </div>
        </div>
      </div>
    );
  }

  // Active Workspace State
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
      <div className="flex flex-col md:flex-row flex-grow h-full">
        
        {/* Left Sidebar */}
        <BatchSidebar 
          config={config}
          setConfig={setConfig}
          queue={queue}
          isProcessing={isProcessingBatch}
          completedCount={completedCount}
          onProcess={() => processBatch(config)}
          onClear={clearQueue}
        />

        {/* Right Area: Main View + Queue Strip */}
        <div className="flex-grow flex flex-col bg-slate-50 overflow-hidden relative">
          
          {/* Main Preview Area */}
          <div className="flex-grow p-6 flex items-center justify-center overflow-hidden relative">
            <PreviewArea 
              activeItem={activeItem}
              onDownload={handleDownloadSingle}
              onRetry={(item) => processSingleItem(item, config)}
            />
          </div>

          {/* Bottom Queue Strip */}
          <QueueStrip 
            queue={queue}
            activeId={activeId}
            isProcessing={isProcessingBatch}
            onSelect={setActiveId}
            onRemove={removeItem}
            onAddFiles={addFiles}
          />
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default Workspace;