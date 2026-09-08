import Workspace from '@client/components/features/workspace/Workspace';
import { serverEnv } from '@shared/config/env';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Workspace faceEnhancementAvailable={serverEnv.ENABLE_PREMIUM_MODELS} />
    </div>
  );
}
