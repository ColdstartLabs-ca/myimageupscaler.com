/**
 * Gallery Cleanup Service
 *
 * Deletion is gated behind `serverEnv.GALLERY_EXPIRY_ENABLED`. While disabled
 * this performs no database, storage, or executor work and reports the same
 * explicit reason.
 */

import { serverEnv } from '@shared/config/env';

import { runVerifiedGalleryExpiry } from './gallery-expiry-executor.service';

export interface ICleanupJobResult {
  /** Registry items handled this run (images, not users). */
  imagesProcessed: number;
  /** Images actually deleted after a verified finish. */
  imagesDeleted: number;
  /** Images restored from the immutable archive. */
  recovered: number;
  /** Items left for operator review. */
  failed: number;
  /** Timestamp of the cleanup run. */
  timestamp: string;
  /** True while automatic deletion is gated off. */
  deletionDisabled: boolean;
  /** Machine-readable reason for the gate. */
  reason: string;
}

/**
 * Run the full cleanup job.
 *
 * Disabled: returns zeroed counters with no database, storage, or executor
 * access. Enabled: runs the reviewed executor and throws on any failure so the
 * cron route returns 500 and records no success.
 */
export async function runGalleryCleanup(): Promise<ICleanupJobResult> {
  const timestamp = new Date().toISOString();

  if (!serverEnv.GALLERY_EXPIRY_ENABLED) {
    return {
      imagesProcessed: 0,
      imagesDeleted: 0,
      recovered: 0,
      failed: 0,
      timestamp,
      deletionDisabled: true,
      reason: 'verified_backup_required',
    };
  }

  const result = await runVerifiedGalleryExpiry();
  if (result.failed > 0) {
    throw new Error(`Gallery expiry reported ${result.failed} failed item(s); operator review required`);
  }

  return {
    imagesProcessed: result.processed,
    imagesDeleted: result.deleted,
    recovered: result.recovered,
    failed: result.failed,
    timestamp,
    deletionDisabled: false,
    reason: '',
  };
}
