'use client';

/**
 * Inline upsell shown after a free tool produced an image.
 * Hands the processed image to the AI upscaler workspace so the user
 * does not have to upload it again.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <button
      type="button"
      onClick={handleClick}
      disabled={isSaving}
      className="w-full px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
    >
      Upscale This Image 4× with AI →
    </button>
  );
}
