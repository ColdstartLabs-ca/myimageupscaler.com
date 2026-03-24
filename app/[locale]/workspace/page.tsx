import { Suspense } from 'react';
import Workspace from '@client/components/features/workspace/Workspace';

/**
 * Workspace page - main image upscaling interface
 * This is the primary interface for upscaling images with various quality tiers.
 */
export default function WorkspacePage() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
