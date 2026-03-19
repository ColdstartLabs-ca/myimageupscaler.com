'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface IFileSizeUpgradePromptProps {
  fileSize: number;
  onDismiss: () => void;
  onUpgrade?: () => void;
}

const formatBytes = (bytes: number): string => {
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
};

export function FileSizeUpgradePrompt({
  fileSize,
  onDismiss,
  onUpgrade,
}: IFileSizeUpgradePromptProps): JSX.Element {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            File too large for free tier
          </h3>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Your file is {formatBytes(fileSize)}. Free tier supports up to 5MB.
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
            Paid plans support files up to 25MB
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onUpgrade}
              className="inline-flex items-center rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              Upgrade Now
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center rounded-md border border-amber-300 bg-surface px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
            >
              Use smaller file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
