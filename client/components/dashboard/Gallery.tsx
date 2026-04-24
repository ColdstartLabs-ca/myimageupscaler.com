'use client';

import React, { useEffect } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useGallery } from '@client/hooks/useGallery';
import { GalleryImageCard } from './GalleryImageCard';
import { useUserData } from '@client/store/userStore';
import { PurchaseModal } from '@client/components/stripe/PurchaseModal';
import { useState } from 'react';

/**
 * Loading skeleton for image cards
 */
function GallerySkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-xl border border-border overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-surface-light" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-surface-light rounded w-3/4" />
            <div className="h-3 bg-surface-light rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no images saved
 */
function EmptyState() {
  const t = useTranslations('dashboard.gallery');

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-full bg-surface-light flex items-center justify-center mb-6">
        <ImageIcon size={40} className="text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{t('emptyTitle')}</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">{t('emptyDescription')}</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors"
      >
        {t('saveFirstImage')}
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}

/**
 * Usage progress bar showing image count
 */
function UsageBar({
  current,
  max,
  isFreeUserAtLimit,
}: {
  current: number;
  max: number;
  isFreeUserAtLimit: boolean;
}) {
  const t = useTranslations('dashboard.gallery');
  const percentage = Math.min((current / max) * 100, 100);

  return (
    <div className="bg-surface rounded-xl border border-border p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{t('usageLabel')}</span>
        <span className="text-sm font-medium text-white">
          {current} / {max} {t('images')}
        </span>
      </div>
      <div className="h-2 bg-surface-light rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isFreeUserAtLimit ? 'bg-warning' : 'bg-accent'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isFreeUserAtLimit && <p className="text-xs text-warning mt-2">{t('limitReached')}</p>}
    </div>
  );
}

/**
 * Upgrade banner for free users at limit
 */
function UpgradeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const t = useTranslations('dashboard.gallery');

  return (
    <div className="bg-gradient-to-r from-accent/20 to-accent/5 border border-accent/30 rounded-xl p-4 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold text-white">{t('upgradeTitle')}</h4>
          <p className="text-sm text-muted-foreground">{t('upgradeDescription')}</p>
        </div>
        <button
          onClick={onUpgrade}
          className="flex-shrink-0 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          {t('upgradeNow')}
        </button>
      </div>
    </div>
  );
}

/**
 * Main Gallery component
 */
export function Gallery(): JSX.Element {
  const t = useTranslations('dashboard.gallery');
  const { isFreeUser } = useUserData();
  const {
    usage,
    listState,
    isLoadingImages,
    isLoadingUsage,
    isDeleting,
    fetchImages,
    loadMore,
    refresh,
    deleteImage,
  } = useGallery();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Fetch images on mount
  useEffect(() => {
    fetchImages(1);
  }, [fetchImages]);

  // Check if free user is at limit
  const isFreeUserAtLimit =
    isFreeUser && usage !== null && usage.current_count >= usage.max_allowed;

  const handleDeleteImage = async (imageId: string) => {
    await deleteImage(imageId);
  };

  const isLoading = isLoadingImages && listState.images.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={refresh}
          disabled={isLoadingImages || isLoadingUsage}
          className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-white hover:bg-surface/10 rounded-lg transition-colors disabled:opacity-50"
          title={t('refresh')}
        >
          <RefreshCw
            size={16}
            className={isLoadingImages || isLoadingUsage ? 'animate-spin' : ''}
          />
          <span className="text-sm hidden sm:inline">{t('refresh')}</span>
        </button>
      </div>

      {/* Upgrade Banner for Free Users at Limit */}
      {isFreeUserAtLimit && <UpgradeBanner onUpgrade={() => setShowUpgradeModal(true)} />}

      {/* Usage Bar */}
      {usage !== null && (
        <UsageBar
          current={usage.current_count}
          max={usage.max_allowed}
          isFreeUserAtLimit={isFreeUserAtLimit ?? false}
        />
      )}

      {/* Gallery Content */}
      <div className="bg-surface rounded-xl border border-border p-4 md:p-6">
        {isLoading ? (
          <GallerySkeleton />
        ) : listState.images.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Image Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {listState.images.map(image => (
                <GalleryImageCard
                  key={image.id}
                  image={image}
                  onDelete={handleDeleteImage}
                  isDeleting={isDeleting}
                />
              ))}
            </div>

            {/* Load More Button */}
            {listState.hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingImages}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors disabled:opacity-50"
                >
                  {isLoadingImages ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t('loading')}
                    </>
                  ) : (
                    t('loadMore')
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Purchase Modal */}
      <PurchaseModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onPurchaseComplete={() => {
          setShowUpgradeModal(false);
          refresh();
        }}
        trigger="gallery_upgrade"
      />
    </div>
  );
}
