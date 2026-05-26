import type { IExperimentAssignment } from '@shared/types/experiments.types';

const EXPERIMENT_ASSIGNMENT_PREFIX = 'miu_experiment_assignment';
const EXPERIMENT_SESSION_KEY = 'miu_experiment_session_key';
const ASSIGNMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface IStoredExperimentAssignment extends IExperimentAssignment {
  timestamp: number;
}

function buildStorageKey(experimentKey: string, contextKey: string, assignmentKey: string): string {
  return `${EXPERIMENT_ASSIGNMENT_PREFIX}:${experimentKey}:${contextKey}:${assignmentKey}`;
}

function randomKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function getExperimentSessionKey(): string {
  if (typeof window === 'undefined') return randomKey();

  const existing = sessionStorage.getItem(EXPERIMENT_SESSION_KEY);
  if (existing) return existing;

  const key = randomKey();
  sessionStorage.setItem(EXPERIMENT_SESSION_KEY, key);
  return key;
}

export function readExperimentAssignment(
  experimentKey: string,
  contextKey: string,
  assignmentKey: string
): IExperimentAssignment | null {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(buildStorageKey(experimentKey, contextKey, assignmentKey));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as IStoredExperimentAssignment;
    if (!parsed.timestamp || Date.now() - parsed.timestamp > ASSIGNMENT_MAX_AGE_MS) {
      sessionStorage.removeItem(buildStorageKey(experimentKey, contextKey, assignmentKey));
      return null;
    }

    return {
      experimentKey: parsed.experimentKey,
      contextKey: parsed.contextKey,
      armId: parsed.armId,
      armKey: parsed.armKey,
      armConfig: parsed.armConfig,
      assignmentKey: parsed.assignmentKey,
      surface: parsed.surface,
    };
  } catch {
    sessionStorage.removeItem(buildStorageKey(experimentKey, contextKey, assignmentKey));
    return null;
  }
}

export function writeExperimentAssignment(assignment: IExperimentAssignment): void {
  if (typeof window === 'undefined') return;

  const stored: IStoredExperimentAssignment = {
    ...assignment,
    timestamp: Date.now(),
  };

  sessionStorage.setItem(
    buildStorageKey(assignment.experimentKey, assignment.contextKey, assignment.assignmentKey),
    JSON.stringify(stored)
  );
}
