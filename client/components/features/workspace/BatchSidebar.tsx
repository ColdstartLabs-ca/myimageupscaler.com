import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import {
  IUpscaleConfig,
  IBatchItem,
  ProcessingStatus,
  ModelId,
  IEnhancementSettings,
  DEFAULT_ENHANCEMENT_SETTINGS,
  DEFAULT_NANO_BANANA_PRO_CONFIG,
} from '@shared/types/pixelperfect';
import { downloadBatch } from '@client/utils/download';
import { useUserData } from '@client/store/userStore';
import { getCreditCostForMode, calculateModelCreditCost } from '@shared/config/subscription.utils';
import { generatePrompt } from '@client/utils/prompt-utils';
import {
  ModeSelector,
  EnhancementPanel,
  ModelSelector,
  UpscaleFactorSelector,
  FeatureToggles,
  ActionPanel,
} from './BatchSidebar/index';

interface IBatchProgress {
  current: number;
  total: number;
}

interface IBatchSidebarProps {
  config: IUpscaleConfig;
  setConfig: (config: IUpscaleConfig) => void;
  queue: IBatchItem[];
  isProcessing: boolean;
  batchProgress: IBatchProgress | null;
  completedCount: number;
  onProcess: () => void;
  onClear: () => void;
}

export const BatchSidebar: React.FC<IBatchSidebarProps> = ({
  config,
  setConfig,
  queue,
  isProcessing,
  batchProgress,
  completedCount,
  onProcess,
  onClear,
}) => {
  const router = useRouter();
  const { totalCredits, profile } = useUserData();
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);

  // Determine if user is on free tier (no subscription or subscription_tier is null)
  const isFreeUser = !profile?.subscription_tier;

  const handleDownloadAll = () => {
    downloadBatch(queue, config.mode);
  };

  // Calculate credit costs (considering model and scale)
  const pendingQueue = queue.filter(i => i.status !== ProcessingStatus.COMPLETED);
  const isAutoModel = config.selectedModel === 'auto';
  const costPerImage = isAutoModel
    ? getCreditCostForMode(config.mode)
    : calculateModelCreditCost({
        mode: config.mode,
        modelId: config.selectedModel,
        scale: config.scale,
      });
  const totalCost = pendingQueue.length * costPerImage;

  // Handler functions for sub-components
  const handleModeChange = (mode: typeof config.mode) => {
    setConfig({ ...config, mode });
  };

  const handleEnhancementChange = (enhancement: IEnhancementSettings) => {
    setConfig({ ...config, enhancement });
  };

  const handleScaleChange = (scale: 2 | 4 | 8) => {
    setConfig({ ...config, scale });
  };

  const handleModelChange = (selectedModel: 'auto' | ModelId) => {
    setConfig({ ...config, selectedModel });
  };

  const handleNanoBananaProConfigChange = (
    nanoBananaProConfig: typeof DEFAULT_NANO_BANANA_PRO_CONFIG
  ) => {
    setConfig({ ...config, nanoBananaProConfig });
  };

  const handleAllowExpensiveModelsChange = (allowExpensiveModels: boolean) => {
    setConfig({ ...config, allowExpensiveModels });
  };

  const handlePreserveTextChange = (preserveText: boolean) => {
    setConfig({ ...config, preserveText });
  };

  const handleEnhanceFaceChange = (enhanceFace: boolean) => {
    setConfig({ ...config, enhanceFace });
  };

  const handlePromptChange = (customPrompt: string) => {
    setConfig({ ...config, customPrompt });
  };

  // Generate a placeholder prompt based on current settings (forcing 'both' mode logic to give a good full example)
  const placeholderPrompt = generatePrompt({ ...config, mode: 'both' });

  return (
    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex flex-col z-20 shadow-sm h-full">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 border-b border-slate-100 shrink-0">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-1 text-base md:text-base">
          <Settings size={16} className="md:size-[18px]" /> Batch Settings
        </h3>
        <p className="text-xs text-slate-500">Applies to all {queue.length} images</p>
      </div>

      {/* Action Panel - Moved to top for better visibility */}
      <div className="shrink-0">
        <ActionPanel
          queue={queue}
          isProcessing={isProcessing}
          batchProgress={batchProgress}
          completedCount={completedCount}
          totalCost={totalCost}
          currentBalance={totalCredits}
          onProcess={onProcess}
          onDownloadAll={handleDownloadAll}
          onClear={onClear}
          showInsufficientModal={showInsufficientModal}
          setShowInsufficientModal={setShowInsufficientModal}
          router={router}
        />
      </div>

      {/* Divider */}
      <div className="px-4 md:px-6 py-3 md:py-4 shrink-0">
        <div className="h-px bg-slate-200"></div>
        <p className="text-xs font-medium text-slate-500 mt-3 md:mt-4 mb-2">Processing Options</p>
      </div>

      {/* Controls - Scrollable */}
      <div className="space-y-4 md:space-y-6 flex-grow overflow-y-auto custom-scrollbar px-4 md:px-6 pb-4 md:pb-6 h-full">
        <ModeSelector mode={config.mode} onChange={handleModeChange} disabled={isProcessing} />

        {config.mode === 'enhance' && (
          <EnhancementPanel
            settings={config.enhancement || DEFAULT_ENHANCEMENT_SETTINGS}
            onChange={handleEnhancementChange}
            disabled={isProcessing}
          />
        )}

        {config.mode === 'custom' && (
          <div className="animate-fade-in">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Custom Prompt Instructions
            </label>
            <textarea
              className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[140px] resize-y font-mono bg-slate-50 text-slate-800"
              placeholder={placeholderPrompt}
              value={config.customPrompt || ''}
              onChange={e => handlePromptChange(e.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <button
                className="text-[10px] uppercase font-bold text-indigo-600 hover:text-indigo-800 tracking-wider bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
                onClick={() => handlePromptChange(placeholderPrompt)}
              >
                Load Template
              </button>
            </div>
          </div>
        )}

        <ModelSelector
          selectedModel={config.selectedModel}
          nanoBananaProConfig={config.nanoBananaProConfig || DEFAULT_NANO_BANANA_PRO_CONFIG}
          allowExpensiveModels={config.allowExpensiveModels ?? false}
          onModelChange={handleModelChange}
          onNanoBananaProConfigChange={handleNanoBananaProConfigChange}
          onAllowExpensiveModelsChange={handleAllowExpensiveModelsChange}
          disabled={isProcessing}
          isFreeUser={isFreeUser}
        />

        {(config.mode === 'upscale' || config.mode === 'both') && (
          <UpscaleFactorSelector
            scale={config.scale}
            onChange={handleScaleChange}
            disabled={isProcessing}
          />
        )}

        <FeatureToggles
          preserveText={config.preserveText}
          enhanceFace={config.enhanceFace}
          onPreserveTextChange={handlePreserveTextChange}
          onEnhanceFaceChange={handleEnhanceFaceChange}
          disabled={isProcessing}
        />
      </div>
    </div>
  );
};
