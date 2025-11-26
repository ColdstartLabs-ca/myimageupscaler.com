import React from 'react';
import {
  Settings,
  ArrowUpCircle,
  Sparkles,
  Layers,
  Type,
  UserSquare2,
  Loader2,
  Wand2,
  Download,
  Trash2,
  Edit,
} from 'lucide-react';
import Button from '@client/components/pixelperfect/Button';
import { IUpscaleConfig, IBatchItem, ProcessingStatus } from '@shared/types/pixelperfect';
import { downloadBatch } from '@client/utils/download';

interface IBatchSidebarProps {
  config: IUpscaleConfig;
  setConfig: (config: IUpscaleConfig) => void;
  queue: IBatchItem[];
  isProcessing: boolean;
  completedCount: number;
  onProcess: () => void;
  onClear: () => void;
}

const generatePrompt = (config: IUpscaleConfig): string => {
  if (config.mode === 'custom' && config.customPrompt && config.customPrompt.trim().length > 0) {
    return config.customPrompt;
  }

  const effectiveMode = config.mode === 'custom' ? 'both' : config.mode;
  let prompt =
    'Task: Generate a high-definition version of the provided image with significantly improved quality. ';

  switch (effectiveMode) {
    case 'upscale':
      prompt += `Action: Reconstruct the image at ${config.scale}x resolution (target 2K/4K). Aggressively sharpen edges and hallucinate plausible fine details to remove blur. `;
      break;
    case 'enhance':
      prompt +=
        'Action: Refine the image clarity. Remove all JPEG compression artifacts, grain, and sensor noise. Balance the lighting and color saturation for a professional look. ';
      break;
    case 'both':
    default:
      prompt += `Action: Reconstruct the image at ${config.scale}x resolution. Simultaneously remove noise/artifacts and sharpen fine details. The output must be crisp and photorealistic. `;
      break;
  }

  if (config.preserveText) {
    prompt +=
      'Constraint: Text and logos MUST remain legible, straight, and spelled correctly. Sharpen the text boundaries. ';
  } else {
    prompt += 'Constraint: Prioritize visual aesthetics. ';
  }

  if (config.enhanceFace) {
    prompt +=
      "Constraint: Enhance facial features naturally (eyes, skin texture) without altering the person's identity. ";
  }

  if (config.denoise) {
    prompt += 'Constraint: Apply strong denoising to smooth out flat areas. ';
  }

  prompt += 'Output: Return ONLY the generated image.';
  return prompt;
};

const BatchSidebar: React.FC<IBatchSidebarProps> = ({
  config,
  setConfig,
  queue,
  isProcessing,
  completedCount,
  onProcess,
  onClear,
}) => {
  const handleDownloadAll = () => {
    downloadBatch(queue, config.mode);
  };

  // Generate a placeholder prompt based on current settings (forcing 'both' mode logic to give a good full example)
  const placeholderPrompt = generatePrompt({ ...config, mode: 'both' });

  return (
    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 p-6 bg-white flex flex-col z-20 shadow-sm h-full">
      <div className="mb-6">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <Settings size={18} /> Batch Settings
        </h3>
        <p className="text-xs text-slate-500">Applies to all {queue.length} images</p>
      </div>

      {/* Controls */}
      <div className="space-y-6 flex-grow overflow-y-auto custom-scrollbar pr-2">
        {/* Mode Selection */}
        <div>
          <label className="text-sm font-medium text-slate-700 mb-3 block">Operation Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfig({ ...config, mode: 'upscale' })}
              disabled={isProcessing}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${config.mode === 'upscale' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <ArrowUpCircle size={18} className="mb-1" />
              Upscale
            </button>
            <button
              onClick={() => setConfig({ ...config, mode: 'enhance' })}
              disabled={isProcessing}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${config.mode === 'enhance' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Sparkles size={18} className="mb-1" />
              Enhance
            </button>
            <button
              onClick={() => setConfig({ ...config, mode: 'both' })}
              disabled={isProcessing}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${config.mode === 'both' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Layers size={18} className="mb-1" />
              Both
            </button>
            <button
              onClick={() => setConfig({ ...config, mode: 'custom' })}
              disabled={isProcessing}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${config.mode === 'custom' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Edit size={18} className="mb-1" />
              Custom
            </button>
          </div>

          {/* Custom Prompt Input */}
          {config.mode === 'custom' && (
            <div className="mt-3 animate-fade-in">
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Custom Prompt Instructions
              </label>
              <textarea
                className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[140px] resize-y font-mono bg-slate-50 text-slate-800"
                placeholder={placeholderPrompt}
                value={config.customPrompt || ''}
                onChange={e => setConfig({ ...config, customPrompt: e.target.value })}
              />
              <div className="mt-2 flex justify-end">
                <button
                  className="text-[10px] uppercase font-bold text-indigo-600 hover:text-indigo-800 tracking-wider bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                  onClick={() => setConfig({ ...config, customPrompt: placeholderPrompt })}
                >
                  Load Template
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upscale Factor */}
        {(config.mode === 'upscale' || config.mode === 'both') && (
          <div>
            <label className="text-sm font-medium text-slate-700 mb-3 block">Upscale Factor</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfig({ ...config, scale: 2 })}
                disabled={isProcessing}
                className={`py-2 px-4 rounded-lg border text-sm font-medium transition-all ${config.scale === 2 ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                2x (HD)
              </button>
              <button
                onClick={() => setConfig({ ...config, scale: 4 })}
                disabled={isProcessing}
                className={`py-2 px-4 rounded-lg border text-sm font-medium transition-all ${config.scale === 4 ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                4x (Ultra)
              </button>
            </div>
          </div>
        )}

        {/* Toggles */}
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={config.preserveText}
              onChange={e => setConfig({ ...config, preserveText: e.target.checked })}
              disabled={isProcessing}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-slate-900 block flex items-center gap-2">
                <Type size={14} /> Text Preservation
              </span>
              <span className="text-xs text-slate-500">Keep text and logos sharp.</span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={config.enhanceFace}
              onChange={e => setConfig({ ...config, enhanceFace: e.target.checked })}
              disabled={isProcessing}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-slate-900 block flex items-center gap-2">
                <UserSquare2 size={14} /> Face Enhancement
              </span>
              <span className="text-xs text-slate-500">Ethical restoration.</span>
            </div>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
        <Button
          onClick={onProcess}
          className="w-full shadow-md shadow-indigo-100"
          size="lg"
          disabled={isProcessing || queue.every(i => i.status === ProcessingStatus.COMPLETED)}
          icon={isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
        >
          {isProcessing
            ? `Processing...`
            : completedCount > 0 && completedCount < queue.length
              ? `Process Remaining (${queue.length - completedCount})`
              : completedCount === queue.length
                ? 'Processed All'
                : `Process All (${queue.length})`}
        </Button>

        {completedCount > 0 && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleDownloadAll}
            icon={<Download size={16} />}
          >
            Download All (ZIP)
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
          onClick={onClear}
          disabled={isProcessing}
          icon={<Trash2 size={16} />}
        >
          Clear Queue
        </Button>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default BatchSidebar;
