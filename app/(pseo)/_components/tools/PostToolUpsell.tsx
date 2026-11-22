'use client';

/**
 * Inline upsell shown after a free tool produced an image.
 * Hands the processed image to the AI upscaler workspace so the user
 * does not have to upload it again.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { analytics } from '@client/analytics/analyticsClient';
import { useUserStore } from '@client/store/userStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { saveToolHandoffImage } from '@client/utils/tool-image-handoff';

export interface IPostToolUpsellProps {
  blob: Blob;
  fileName: string;
  toolId: string;
}

export function PostToolUpsell({
  blob,
  fileName,
  toolId,
}: IPostToolUpsellProps): React.ReactElement {
  const router = useRouter();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const [isSaving, setIsSaving] = useState(false);

  const handleClick = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await saveToolHandoffImage(blob, fileName, toolId);
      analytics.track('post_tool_upsell_clicked', {
        tool: toolId,
        outputType: blob.type,
        outputBytes: blob.size,
      });

      if (isAuthenticated) {
        router.push('/dashboard?handoff=tool');
        return;
      }

      // Keep the intent through the register modal: the post-auth handler
      // consumes auth_redirect_intent and lands the new user on the returnTo.
      prepareAuthRedirect('tool_upsell', { returnTo: '/dashboard?handoff=tool' });
      router.push('/?signup=1');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-tertiary/10 p-4 shadow-lg shadow-accent/10 sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-secondary shadow-md shadow-accent/30">
          <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-primary">Want it sharper and bigger?</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Send this result to the AI upscaler. Free to start, no credit card required.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={isSaving}
          className="gradient-cta shine-effect group inline-flex w-full flex-shrink-0 items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          Upscale This Image 4× with AI
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
