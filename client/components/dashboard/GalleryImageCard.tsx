'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Download, Eye, Trash2, Loader2, X } from 'lucide-react';
import type { IGalleryImage } from '@shared/types/gallery.types';
import { useTranslations } from 'next-intl';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

interface IGalleryImageCardProps {
  /** The image to display */
  image: IGalleryImage;
  /** Callback when delete is requested */
  onDelete: (imageId: string) => Promise<void>;
  /** Whether a delete operation is in progress */
  isDeleting?: boolean;
}

/**
 * Modal for confirming image deletion
 */
function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  imageName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  imageName: string;
}) {
  const t = useTranslations('dashboard.gallery');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center">
            <Trash2 size={20} className="text-error" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{t('deleteImage')}</h3>
            <p className="text-sm text-muted-foreground">{t('deleteConfirm')}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          {t('deleteWarning', { filename: imageName })}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-error text-white rounded-lg hover:bg-error/80 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for viewing full-size image
 */
function ImagePreviewModal({
  isOpen,
  onClose,
  image,
}: {
  isOpen: boolean;
  onClose: () => void;
  image: IGalleryImage | null;
}) {
  const t = useTranslations('dashboard.gallery');

  if (!isOpen || !image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-surface/80 text-white hover:bg-surface transition-colors"
        aria-label="Close preview"
      >
        <X size={24} />
      </button>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <Image
          src={image.signed_url || ''}
          alt={image.original_filename}
          width={image.width}
          height={image.height}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
          unoptimized
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
          <p className="text-white text-sm font-medium truncate">{image.original_filename}</p>
          <p className="text-white/70 text-xs">
            {t('dimensions', { width: image.width, height: image.height })}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Truncate filename to fit in card
 */
function truncateFilename(filename: string, maxLength: number = 25): string {
  if (filename.length <= maxLength) return filename;
  const ext = filename.split('.').pop() || '';
  const nameWithoutExt = filename.slice(0, -(ext.length + 1));
  const truncatedName = nameWithoutExt.slice(0, maxLength - ext.length - 4);
  return `${truncatedName}...${ext}`;
}

/**
 * Gallery image card component
 * Displays a single image with hover actions and metadata
 */
export const GalleryImageCard: React.FC<IGalleryImageCardProps> = ({
  image,
  onDelete,
  isDeleting = false,
}) => {
  const t = useTranslations('dashboard.gallery');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isDeletingThis, setIsDeletingThis] = useState(false);

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeletingThis(true);
    try {
      await onDelete(image.id);
      setShowDeleteModal(false);
    } finally {
      setIsDeletingThis(false);
    }
  };

  const handleDownload = async () => {
    if (!image.signed_url) return;

    let objectUrl: string | null = null;
    let anchor: HTMLAnchorElement | null = null;

    try {
      const response = await fetch(image.signed_url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      objectUrl = window.URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = image.original_filename;
      document.body.appendChild(anchor);
      anchor.click();
    } catch (err) {
      console.error('Failed to download image:', err);
    } finally {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
      if (anchor) document.body.removeChild(anchor);
    }
  };

  const handleViewFullSize = () => {
    setShowPreviewModal(true);
  };

  const formattedDate = dayjs(image.created_at).fromNow();

  return (
    <>
      <div className="group relative bg-surface rounded-xl border border-border overflow-hidden transition-all hover:border-accent/50">
        {/* Image Container */}
        <div className="relative aspect-square bg-surface-light">
          <Image
            src={image.signed_url || ''}
            alt={image.original_filename}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            unoptimized
          />

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              onClick={handleViewFullSize}
              className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
              title={t('viewFullSize')}
            >
              <Eye size={20} />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
              title={t('download')}
            >
              <Download size={20} />
            </button>
            <button
              onClick={handleDeleteClick}
              disabled={isDeleting || isDeletingThis}
              className="p-2 rounded-lg bg-error/50 text-white hover:bg-error/70 transition-colors disabled:opacity-50"
              title={t('delete')}
            >
              {isDeletingThis ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Trash2 size={20} />
              )}
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="p-3 space-y-1">
          <p className="text-sm font-medium text-white truncate" title={image.original_filename}>
            {truncateFilename(image.original_filename)}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[60%]" title={image.model_used}>
              {image.model_used}
            </span>
            <span className="flex-shrink-0">{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeletingThis}
        imageName={image.original_filename}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        image={image}
      />
    </>
  );
};
