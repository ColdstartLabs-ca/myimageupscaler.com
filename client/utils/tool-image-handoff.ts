/**
 * One-shot image handoff between a free browser tool and the AI upscaler workspace.
 *
 * The processed image is stored in IndexedDB (too large for localStorage) and
 * consumed once by the workspace. Entries older than 30 minutes are ignored so
 * a stale handoff never surprises the user.
 */

import { QUALITY_TIER_SCALES, type IUpscaleConfig } from '@/shared/types/coreflow.types';

/** The free-tool upsell promises 4x: apply it when the active tier offers 4x. */
export const TOOL_HANDOFF_SCALE = 4;

export function withToolHandoffScale(config: IUpscaleConfig): IUpscaleConfig {
  const scales: readonly number[] = QUALITY_TIER_SCALES[config.qualityTier] ?? [];
  return scales.includes(TOOL_HANDOFF_SCALE) ? { ...config, scale: TOOL_HANDOFF_SCALE } : config;
}

const DB_NAME = 'miu-tool-handoff';
const DB_VERSION = 1;
const STORE_NAME = 'handoff';
const RECORD_KEY = 'pending';
const MAX_AGE_MS = 30 * 60 * 1000;

interface IToolHandoffRecord {
  blob: Blob;
  fileName: string;
  sourceTool: string;
  createdAt: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}

export async function saveToolHandoffImage(
  blob: Blob,
  fileName: string,
  sourceTool: string
): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openHandoffDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const record: IToolHandoffRecord = { blob, fileName, sourceTool, createdAt: Date.now() };
        tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // Best effort: the user can still pick the file in the workspace.
  }
}

export async function takeToolHandoffImage(): Promise<File | null> {
  if (!isIndexedDbAvailable()) return null;

  try {
    const db = await openHandoffDb();
    try {
      const stored = await new Promise<IToolHandoffRecord | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(RECORD_KEY);
        let record: IToolHandoffRecord | null = null;

        getRequest.onsuccess = () => {
          record = (getRequest.result as IToolHandoffRecord | undefined) ?? null;
          store.delete(RECORD_KEY);
        };
        getRequest.onerror = () => reject(getRequest.error);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      if (!stored || Date.now() - stored.createdAt > MAX_AGE_MS) return null;
      return new File([stored.blob], stored.fileName, { type: stored.blob.type });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
