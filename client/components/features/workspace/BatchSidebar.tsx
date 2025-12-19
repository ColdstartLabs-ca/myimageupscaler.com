import {
  DEFAULT_ADDITIONAL_OPTIONS,
  IAdditionalOptions,
  IBatchItem,
  IUpscaleConfig,
  ProcessingStatus,
  QUALITY_TIER_CREDITS,
  QualityTier,
} from '@/shared/types/coreflow.types';
import { useUserData } from '@client/store/userStore';
import { downloadBatch } from '@client/utils/download';
import { generatePrompt } from '@client/utils/prompt-utils';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import {
  ActionPanel,
  CustomInstructionsModal,
  EnhancementOptions,
  QualityTierSelector,
  UpscaleFactorSelector,
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
  const [showCustomInstructionsModal, setShowCustomInstructionsModal] = useState(false);

  // Determine if user is on free tier (no subscription or subscription_tier is null)
  const isFreeUser = !profile?.subscription_tier;

  const handleDownloadAll = () => {
    downloadBatch(queue, config.qualityTier);
  };

  // Calculate credit costs using new quality tier system
  const pendingQueue = queue.filter(i => i.status !== ProcessingStatus.COMPLETED);

  // Get cost per image based on quality tier, scale, and smart analysis
  const getCostPerImage = (): number => {
    const { qualityTier, scale, additionalOptions } = config;
    const { creditCosts } = getSubscriptionConfig();

    // Smart analysis cost (1 credit when enabled and not in auto mode)
    // Auto mode always uses smart analysis, so it's included in the base cost
    const smartAnalysisCost = qualityTier !== 'auto' && additionalOptions?.smartAnalysis ? 1 : 0;

    if (qualityTier === 'auto') {
      // Auto mode uses variable cost - estimate average (includes smart analysis)
      return 4;
    }

    // For explicit tiers, base cost on tier credits and scale multiplier from config
    const tierCredits = QUALITY_TIER_CREDITS[qualityTier];
    const baseCost = typeof tierCredits === 'number' ? tierCredits : 4;

    // Use scale multiplier from config (currently all 1.0)
    const scaleKey = `${scale}x` as '2x' | '4x' | '8x';
    const scaleMultiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;

    return Math.ceil(baseCost * scaleMultiplier) + smartAnalysisCost;
  };

  const costPerImage = getCostPerImage();
  const totalCost = pendingQueue.length * costPerImage;

  // Handler functions for sub-components
  const handleQualityTierChange = (qualityTier: QualityTier) => {
    setConfig({ ...config, qualityTier });
  };

  const handleAdditionalOptionsChange = (additionalOptions: IAdditionalOptions) => {
    setConfig({ ...config, additionalOptions });
  };

  const handleScaleChange = (scale: 2 | 4 | 8) => {
    setConfig({ ...config, scale });
  };

  const handleCustomInstructionsSave = (customInstructions: string) => {
    setConfig({
      ...config,
      additionalOptions: {
        ...config.additionalOptions,
        customInstructions: customInstructions || undefined,
      },
    });
    setShowCustomInstructionsModal(false);
  };

  const handleOpenCustomInstructions = () => {
    setShowCustomInstructionsModal(true);
  };

  const handleCloseCustomInstructions = () => {
    setShowCustomInstructionsModal(false);
  };

  // Generate a placeholder prompt based on current settings
  const placeholderPrompt = generatePrompt(config);

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
          isFreeUser={isFreeUser}
        />
      </div>

      {/* Divider */}
      <div className="px-4 md:px-6 py-3 md:py-4 shrink-0">
        <div className="h-px bg-slate-200"></div>
        <p className="text-xs font-medium text-slate-500 mt-3 md:mt-4 mb-2">Processing Options</p>
      </div>

      {/* Controls - Scrollable */}
      <div className="space-y-4 md:space-y-6 flex-grow overflow-y-auto custom-scrollbar px-4 md:px-6 pb-4 md:pb-6 h-full">
        {/* 1. Quality Tier Selector */}
        <QualityTierSelector
          tier={config.qualityTier}
          onChange={handleQualityTierChange}
          disabled={isProcessing}
          isFreeUser={isFreeUser}
        />

        {/* 2. Upscale Factor Selector (unchanged) */}
        <UpscaleFactorSelector
          scale={config.scale}
          onChange={handleScaleChange}
          disabled={isProcessing}
        />

        {/* 3. Enhancement Options (always visible) */}
        <EnhancementOptions
          options={config.additionalOptions || DEFAULT_ADDITIONAL_OPTIONS}
          onChange={handleAdditionalOptionsChange}
          onOpenCustomInstructions={handleOpenCustomInstructions}
          selectedTier={config.qualityTier}
          disabled={isProcessing}
          isFreeUser={isFreeUser}
        />

        {/* 4. Ultra tier specific config (conditional) */}
        {config.qualityTier === 'ultra' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 border border-indigo-200 rounded-lg bg-indigo-50/30">
              <h4 className="text-sm font-medium text-indigo-900 mb-3">Ultra Settings</h4>
              {/* Add ultra-specific configuration here */}
              <p className="text-xs text-indigo-700">
                Ultra includes maximum quality processing with 4K/8K output support.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 5. Custom Instructions Modal */}
      <CustomInstructionsModal
        isOpen={showCustomInstructionsModal}
        onClose={handleCloseCustomInstructions}
        instructions={config.additionalOptions?.customInstructions || ''}
        onSave={handleCustomInstructionsSave}
        placeholderPrompt={placeholderPrompt}
      />
    </div>
  );
};
