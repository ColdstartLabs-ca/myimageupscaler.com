import { Suspense } from 'react';
import Workspace from '@client/components/features/workspace/Workspace';
import { serverEnv } from '@shared/config/env';

/**
 * Workspace page - main image upscaling interface
 * This is the primary interface for upscaling images with various quality tiers.
 */
export default function WorkspacePage() {
  return (
    <Suspense>
      <Workspace faceEnhancementAvailable={serverEnv.ENABLE_PREMIUM_MODELS} />
    </Suspense>
  );
}
