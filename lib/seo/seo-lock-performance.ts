export interface ISeoChangeInput {
  beforeClicks: number;
  afterClicks: number;
  controlBeforeClicks: number;
  controlAfterClicks: number;
  heldDays: number;
}

const MIN_HELD_DAYS = 14;
const THRESHOLD = 0.25;
const FLOAT_TOLERANCE = 1e-9;

export function classifySeoChange(
  input: ISeoChangeInput,
): 'WIN' | 'FLAT' | 'LOSS' | null {
  const { beforeClicks, afterClicks, controlBeforeClicks, controlAfterClicks, heldDays } =
    input ?? {};

  if (
    !Number.isFinite(beforeClicks) ||
    !Number.isFinite(afterClicks) ||
    !Number.isFinite(controlBeforeClicks) ||
    !Number.isFinite(controlAfterClicks) ||
    !Number.isFinite(heldDays)
  ) {
    return null;
  }

  if (
    beforeClicks < 0 ||
    afterClicks < 0 ||
    controlBeforeClicks < 0 ||
    controlAfterClicks < 0 ||
    heldDays < MIN_HELD_DAYS
  ) {
    return null;
  }

  if (beforeClicks === 0 || controlBeforeClicks === 0 || controlAfterClicks === 0) {
    return null;
  }

  const relativeLift =
    afterClicks / beforeClicks / (controlAfterClicks / controlBeforeClicks) - 1;

  if (relativeLift >= THRESHOLD - FLOAT_TOLERANCE) return 'WIN';
  if (relativeLift <= -THRESHOLD + FLOAT_TOLERANCE) return 'LOSS';
  return 'FLAT';
}
