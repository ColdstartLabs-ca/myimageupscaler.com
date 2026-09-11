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
  /** True when the image and print aspect ratios differ, so covering the page crops the frame. */
  cropRequired: boolean;
  /** Fraction of the image lost to that crop, 0 when the ratios match. */
  croppedFraction: number;
  /** Which axis gets trimmed, or null when nothing is lost. */
  cropAxis: 'width' | 'height' | null;
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

  // Taking the lower of the two is the crop-to-fill result: scaling by
  // targetPpi / min(h, v) is the same as covering the page and trimming the
  // overflow, which is what people actually do with a poster.
  const effectivePpi = Math.min(horizontalPpi, verticalPpi);
  const requiredScale = Math.max(1, targetPpi / effectivePpi);

  // That cover-and-trim step costs part of the frame whenever the aspect ratios
  // differ. The scale figure alone hides it, so report it explicitly.
  const imageAspect = pixelWidth / pixelHeight;
  const printAspect = printWidthInches / printHeightInches;
  const croppedFraction =
    1 - Math.min(imageAspect, printAspect) / Math.max(imageAspect, printAspect);
  const cropRequired = round(croppedFraction, 4) > 0;

  const roundedEffectivePpi = round(effectivePpi);

  return {
    horizontalPpi: round(horizontalPpi),
    verticalPpi: round(verticalPpi),
    effectivePpi: roundedEffectivePpi,
    requiredScale: round(requiredScale),
    // Compare against the figure the caller displays, so the verdict cannot read
    // "about 300 PPI" beside a not-ready warning.
    ready: roundedEffectivePpi >= targetPpi,
    cropRequired,
    croppedFraction: cropRequired ? round(croppedFraction, 4) : 0,
    cropAxis: cropRequired ? (imageAspect > printAspect ? 'width' : 'height') : null,
  };
}
