export interface IPrintReadinessInput {
  pixelWidth: number;
  pixelHeight: number;
  printWidthInches: number;
  printHeightInches: number;
  targetPpi: number;
}

export interface IPrintReadinessResult {
  horizontalPpi: number;
  verticalPpi: number;
  effectivePpi: number;
  requiredScale: number;
  ready: boolean;
}

function requirePositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function calculatePrintReadiness({
  pixelWidth,
  pixelHeight,
  printWidthInches,
  printHeightInches,
  targetPpi,
}: IPrintReadinessInput): IPrintReadinessResult {
  requirePositiveFinite(pixelWidth, 'pixelWidth');
  requirePositiveFinite(pixelHeight, 'pixelHeight');
  requirePositiveFinite(printWidthInches, 'printWidthInches');
  requirePositiveFinite(printHeightInches, 'printHeightInches');
  requirePositiveFinite(targetPpi, 'targetPpi');

  const horizontalPpi = pixelWidth / printWidthInches;
  const verticalPpi = pixelHeight / printHeightInches;
  const effectivePpi = Math.min(horizontalPpi, verticalPpi);
  const requiredScale = Math.max(1, targetPpi / effectivePpi);

  return {
    horizontalPpi: round(horizontalPpi),
    verticalPpi: round(verticalPpi),
    effectivePpi: round(effectivePpi),
    requiredScale: round(requiredScale),
    ready: effectivePpi >= targetPpi,
  };
}
