import { useEffect, useMemo, useState } from 'react';
import { analytics } from '@client/analytics';
import { useUserStore } from '@client/store/userStore';
import {
  getExperimentSessionKey,
  readExperimentAssignment,
  writeExperimentAssignment,
} from '@client/utils/experimentAssignmentStorage';
import type {
  IExperimentAssignment,
  IExperimentArmConfig,
  TExperimentAssignmentScope,
} from '@shared/types/experiments.types';

interface IUseExperimentArmOptions {
  experimentKey: string;
  contextKey?: string;
  assignmentScope?: TExperimentAssignmentScope;
  surface: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  fallbackArm: {
    armKey: string;
    armConfig?: IExperimentArmConfig;
  };
}

interface IUseExperimentArmResult {
  assignment: IExperimentAssignment | null;
  armKey: string;
  armConfig: IExperimentArmConfig;
  isLoading: boolean;
  isFallback: boolean;
}

function buildFallbackAssignment(
  params: {
    experimentKey: string;
    contextKey: string;
    surface: string;
    fallbackArmKey: string;
    fallbackArmConfig?: IExperimentArmConfig;
  },
  assignmentKey: string
): IExperimentAssignment {
  return {
    experimentKey: params.experimentKey,
    contextKey: params.contextKey,
    armId: 0,
    armKey: params.fallbackArmKey,
    armConfig: params.fallbackArmConfig ?? {},
    assignmentKey,
    surface: params.surface,
  };
}

export function useExperimentArm(options: IUseExperimentArmOptions): IUseExperimentArmResult {
  const {
    experimentKey,
    surface,
    fallbackArm,
    metadata,
    assignmentScope: requestedAssignmentScope,
  } = options;
  const userId = useUserStore(state => state.user?.id);
  const contextKey = options.contextKey || 'global';
  const enabled = options.enabled ?? true;
  const assignmentScope = requestedAssignmentScope ?? 'session';
  const fallbackArmKey = fallbackArm.armKey;
  const fallbackArmConfig = fallbackArm.armConfig;
  const fallbackArmConfigKey = JSON.stringify(fallbackArmConfig ?? {});
  const metadataKey = JSON.stringify(metadata ?? {});
  const assignmentKey = useMemo(() => {
    if (assignmentScope === 'user' && userId) return `user:${userId}`;
    return `session:${getExperimentSessionKey()}`;
  }, [assignmentScope, userId]);

  const [assignment, setAssignment] = useState<IExperimentAssignment | null>(() =>
    readExperimentAssignment(experimentKey, contextKey, assignmentKey)
  );
  const [isLoading, setIsLoading] = useState(enabled && !assignment);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    const stableFallbackArmConfig = JSON.parse(fallbackArmConfigKey) as IExperimentArmConfig;

    if (!enabled) {
      const fallback = buildFallbackAssignment(
        {
          experimentKey,
          contextKey,
          surface,
          fallbackArmKey,
          fallbackArmConfig: stableFallbackArmConfig,
        },
        assignmentKey
      );
      setAssignment(fallback);
      setIsLoading(false);
      setIsFallback(true);
      return;
    }

    const cached = readExperimentAssignment(experimentKey, contextKey, assignmentKey);
    if (cached) {
      setAssignment(cached);
      setIsLoading(false);
      setIsFallback(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.resolve(
      fetch('/api/experiments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experimentKey,
          contextKey,
          assignmentScope,
          assignmentKey,
          surface,
          metadata: metadata ? JSON.parse(metadataKey) : undefined,
        }),
      })
    )
      .then(async response => {
        if (!response?.ok) throw new Error('Experiment assignment failed');
        return (await response.json()) as { assignment: IExperimentAssignment | null };
      })
      .then(({ assignment: nextAssignment }) => {
        if (cancelled) return;

        if (!nextAssignment) {
          throw new Error('Experiment assignment missing');
        }

        writeExperimentAssignment(nextAssignment);
        setAssignment(nextAssignment);
        setIsFallback(false);
        analytics.track('experiment_arm_assigned', {
          experimentKey: nextAssignment.experimentKey,
          contextKey: nextAssignment.contextKey,
          armId: nextAssignment.armId,
          armKey: nextAssignment.armKey,
          assignmentKey: nextAssignment.assignmentKey,
          surface: nextAssignment.surface,
        });
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = buildFallbackAssignment(
          {
            experimentKey,
            contextKey,
            surface,
            fallbackArmKey,
            fallbackArmConfig: stableFallbackArmConfig,
          },
          assignmentKey
        );
        setAssignment(fallback);
        setIsFallback(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    assignmentKey,
    assignmentScope,
    contextKey,
    enabled,
    experimentKey,
    fallbackArmConfigKey,
    fallbackArmKey,
    metadataKey,
    surface,
  ]);

  return {
    assignment,
    armKey: assignment?.armKey ?? fallbackArmKey,
    armConfig: assignment?.armConfig ?? fallbackArmConfig ?? {},
    isLoading,
    isFallback,
  };
}
