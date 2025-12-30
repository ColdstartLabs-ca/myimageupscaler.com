import { IBatchItem, ProcessingStatus } from '@/shared/types/coreflow.types';
import { PremiumUpsellModal } from '@client/components/features/workspace/PremiumUpsellModal';
import { InsufficientCreditsModal } from '@client/components/stripe/InsufficientCreditsModal';
import { Button } from '@client/components/ui/Button';
import { Download, Loader2, Trash2, Wand2 } from 'lucide-react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import React, { useState } from 'react';

interface IBatchProgress {
  current: number;
  total: number;
}

export interface IActionPanelProps {
  queue: IBatchItem[];
  isProcessing: boolean;
  batchProgress: IBatchProgress | null;
  completedCount: number;
  totalCost: number;
  currentBalance: number;
  onProcess: () => void;
  onDownloadAll: () => void;
  onClear: () => void;
  showInsufficientModal: boolean;
  setShowInsufficientModal: (show: boolean) => void;
  router: AppRouterInstance;
  isFreeUser: boolean;
}

export const ActionPanel: React.FC<IActionPanelProps> = ({
  queue,
  isProcessing,
  batchProgress,
  completedCount,
  totalCost,
  currentBalance,
  onProcess,
  onDownloadAll,
  onClear,
  showInsufficientModal,
  setShowInsufficientModal,
  router,
  isFreeUser,
}) => {
  const [showPremiumUpsellModal, setShowPremiumUpsellModal] = useState(false);
  const [hasSeenPremiumUpsell, setHasSeenPremiumUpsell] = useState(false);

  const pendingQueue = queue.filter(i => i.status !== ProcessingStatus.COMPLETED);
  const hasEnoughCredits = currentBalance >= totalCost;

  const handleProcessClick = () => {
    if (!hasEnoughCredits && pendingQueue.length > 0) {
      setShowInsufficientModal(true);
      return;
    }

    // Show premium upsell modal for free users on first process click
    if (isFreeUser && !hasSeenPremiumUpsell && pendingQueue.length > 0) {
      setShowPremiumUpsellModal(true);
      return;
    }

    onProcess();
  };

  const handleProceedWithFree = () => {
    setShowPremiumUpsellModal(false);
    setHasSeenPremiumUpsell(true);
    onProcess();
  };

  const handleViewPlans = () => {
    setShowPremiumUpsellModal(false);
    router.push('/pricing');
  };

  return (
    <div className="px-4 md:px-6 pt-4 pb-3 space-y-4">
      {/* Current Balance Display */}
      {pendingQueue.length > 0 && (
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted-foreground font-medium">Your Balance</span>
          <span className="font-bold text-white">
            {currentBalance} {currentBalance === 1 ? 'credit' : 'credits'}
          </span>
        </div>
      )}

      {/* Primary Process Button with Cost Badge */}
      <button
        onClick={handleProcessClick}
        disabled={isProcessing || queue.every(i => i.status === ProcessingStatus.COMPLETED)}
        className={`
          w-full relative overflow-hidden rounded-xl py-4 px-4
          font-bold text-white
          transition-all duration-300
          flex flex-col items-center justify-center gap-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${
            isProcessing || queue.every(i => i.status === ProcessingStatus.COMPLETED)
              ? 'bg-white/5 text-text-muted'
              : hasEnoughCredits
                ? 'gradient-cta shine-effect active:scale-[0.98] shadow-lg shadow-accent/20'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 active:scale-[0.98] shadow-lg shadow-amber-500/20'
          }
        `}
      >
        <div className="flex items-center justify-center gap-2 relative z-10">
          {isProcessing ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Wand2 size={18} className={hasEnoughCredits ? 'text-white' : ''} />
          )}
          <span className="text-sm font-black tracking-tight">
            {isProcessing && batchProgress
              ? `Processing ${batchProgress.current} / ${batchProgress.total}`
              : isProcessing
                ? 'Processing...'
                : completedCount > 0 && completedCount < queue.length
                  ? `Process Remaining (${queue.length - completedCount})`
                  : completedCount === queue.length
                    ? 'Processed All'
                    : `Process All (${queue.length})`}
          </span>
        </div>

        {/* Credit Cost Display */}
        {pendingQueue.length > 0 &&
          !isProcessing &&
          queue.some(i => i.status !== ProcessingStatus.COMPLETED) && (
            <div
              className={`text-[10px] uppercase tracking-widest font-black opacity-80 relative z-10 ${!hasEnoughCredits ? 'animate-pulse' : ''}`}
            >
              Cost: {totalCost} {totalCost === 1 ? 'credit' : 'credits'}
            </div>
          )}
      </button>

      {/* Insufficient Credits Warning */}
      {!hasEnoughCredits && pendingQueue.length > 0 && (
        <div className="px-3 py-2 bg-amber-500/20 border border-amber-500/20 rounded-lg text-center">
          <p className="text-xs font-medium text-amber-400">
            Need {totalCost - currentBalance} more{' '}
            {totalCost - currentBalance === 1 ? 'credit' : 'credits'} •{' '}
            <a href="/pricing" className="underline hover:text-amber-300">
              Upgrade
            </a>
          </p>
        </div>
      )}

      {completedCount > 0 && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={onDownloadAll}
          icon={<Download size={16} />}
        >
          Download All (ZIP)
        </Button>
      )}

      <Button
        variant="ghost"
        className="w-full text-muted-foreground hover:text-error hover:bg-error/20"
        onClick={onClear}
        disabled={isProcessing}
        icon={<Trash2 size={16} />}
      >
        Clear Queue
      </Button>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        requiredCredits={totalCost}
        currentBalance={currentBalance}
        onBuyCredits={() => router.push('/dashboard/billing')}
        onViewPlans={() => router.push('/pricing')}
      />

      {/* Premium Upsell Modal for Free Users */}
      <PremiumUpsellModal
        isOpen={showPremiumUpsellModal}
        onClose={() => setShowPremiumUpsellModal(false)}
        onProceed={handleProceedWithFree}
        onViewPlans={handleViewPlans}
      />
    </div>
  );
};
