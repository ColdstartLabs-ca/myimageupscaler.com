'use client';

import React, { useState, useMemo } from 'react';

interface ICalculatorResult {
  pixelsRequired: { width: number; height: number };
  currentDPI: number;
  canPrint: boolean;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor';
  upscaleNeeded: number | null;
  recommendation: string;
}

const COMMON_PRINT_SIZES = [
  { label: '4x6 inches', width: 4, height: 6 },
  { label: '5x7 inches', width: 5, height: 7 },
  { label: '8x10 inches', width: 8, height: 10 },
  { label: '11x14 inches', width: 11, height: 14 },
  { label: '16x20 inches', width: 16, height: 20 },
  { label: '20x24 inches', width: 20, height: 24 },
  { label: '24x36 inches (poster)', width: 24, height: 36 },
  { label: 'A4 (8.27x11.69)', width: 8.27, height: 11.69 },
  { label: 'A3 (11.69x16.54)', width: 11.69, height: 16.54 },
  { label: 'Custom', width: 0, height: 0 },
];

export function PrintCalculator(): React.ReactElement {
  const [mode, setMode] = useState<'check' | 'calculate'>('check');

  // Mode: Check if image can print at size
  const [imageWidth, setImageWidth] = useState<number>(1920);
  const [imageHeight, setImageHeight] = useState<number>(1080);
  const [selectedSize, setSelectedSize] = useState<string>('8x10 inches');
  const [customWidth, setCustomWidth] = useState<number>(8);
  const [customHeight, setCustomHeight] = useState<number>(10);
  const [targetDPI, setTargetDPI] = useState<number>(300);

  // Mode: Calculate pixels needed
  const [calcPrintWidth, setCalcPrintWidth] = useState<number>(8);
  const [calcPrintHeight, setCalcPrintHeight] = useState<number>(10);
  const [calcDPI, setCalcDPI] = useState<number>(300);

  const printSize = useMemo(() => {
    if (selectedSize === 'Custom') {
      return { width: customWidth, height: customHeight };
    }
    return COMMON_PRINT_SIZES.find(s => s.label === selectedSize) || { width: 8, height: 10 };
  }, [selectedSize, customWidth, customHeight]);

  const checkResult = useMemo((): ICalculatorResult => {
    const requiredWidth = Math.ceil(printSize.width * targetDPI);
    const requiredHeight = Math.ceil(printSize.height * targetDPI);

    // Calculate current DPI if printed at this size
    const dpiWidth = imageWidth / printSize.width;
    const dpiHeight = imageHeight / printSize.height;
    const currentDPI = Math.min(dpiWidth, dpiHeight);

    let quality: 'excellent' | 'good' | 'acceptable' | 'poor';
    let canPrint = true;
    let recommendation = '';

    if (currentDPI >= 300) {
      quality = 'excellent';
      recommendation = 'Your image has plenty of resolution for this print size.';
    } else if (currentDPI >= 240) {
      quality = 'good';
      recommendation = 'Good quality print. Most people won&apos;t notice it&apos;s not 300 DPI.';
    } else if (currentDPI >= 150) {
      quality = 'acceptable';
      recommendation =
        'Acceptable for viewing at arm&apos;s length. Consider upscaling for close-up viewing.';
    } else {
      quality = 'poor';
      canPrint = false;
      recommendation = 'Too low resolution. Upscaling recommended before printing.';
    }

    // Calculate upscale factor needed
    let upscaleNeeded: number | null = null;
    if (currentDPI < 300) {
      const neededMultiplier = 300 / currentDPI;
      upscaleNeeded = Math.ceil(neededMultiplier);
      if (upscaleNeeded > 8) upscaleNeeded = 8; // Cap at 8x
    }

    return {
      pixelsRequired: { width: requiredWidth, height: requiredHeight },
      currentDPI: Math.round(currentDPI),
      canPrint,
      quality,
      upscaleNeeded,
      recommendation,
    };
  }, [imageWidth, imageHeight, printSize, targetDPI]);

  const calcResult = useMemo(() => {
    const requiredWidth = Math.ceil(calcPrintWidth * calcDPI);
    const requiredHeight = Math.ceil(calcPrintHeight * calcDPI);
    const megapixels = (requiredWidth * requiredHeight) / 1000000;

    return {
      width: requiredWidth,
      height: requiredHeight,
      megapixels: megapixels.toFixed(1),
    };
  }, [calcPrintWidth, calcPrintHeight, calcDPI]);

  const qualityColors = {
    excellent: 'text-success',
    good: 'text-success',
    acceptable: 'text-warning',
    poor: 'text-error',
  };

  return (
    <div className="rounded-xl border border-border-primary bg-surface-secondary p-6">
      <h3 className="mb-4 text-xl font-semibold text-text-primary">Print Size Calculator</h3>

      {/* Mode Toggle */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setMode('check')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'check'
              ? 'bg-accent-primary text-white'
              : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
          }`}
        >
          Check My Image
        </button>
        <button
          onClick={() => setMode('calculate')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'calculate'
              ? 'bg-accent-primary text-white'
              : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
          }`}
        >
          Calculate Pixels Needed
        </button>
      </div>

      {mode === 'check' ? (
        <div className="space-y-6">
          {/* Image Dimensions Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Your image dimensions (pixels)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={imageWidth}
                onChange={e => setImageWidth(Number(e.target.value))}
                className="w-28 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
              />
              <span className="text-text-muted">x</span>
              <input
                type="number"
                value={imageHeight}
                onChange={e => setImageHeight(Number(e.target.value))}
                className="w-28 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
              />
              <span className="text-sm text-text-muted">px</span>
            </div>
          </div>

          {/* Print Size Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Desired print size
            </label>
            <select
              value={selectedSize}
              onChange={e => setSelectedSize(e.target.value)}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              {COMMON_PRINT_SIZES.map(size => (
                <option key={size.label} value={size.label}>
                  {size.label}
                </option>
              ))}
            </select>

            {selectedSize === 'Custom' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  value={customWidth}
                  onChange={e => setCustomWidth(Number(e.target.value))}
                  className="w-20 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                  min="1"
                  step="0.1"
                />
                <span className="text-text-muted">x</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={e => setCustomHeight(Number(e.target.value))}
                  className="w-20 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                  min="1"
                  step="0.1"
                />
                <span className="text-sm text-text-muted">inches</span>
              </div>
            )}
          </div>

          {/* Target DPI */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">Target DPI</label>
            <select
              value={targetDPI}
              onChange={e => setTargetDPI(Number(e.target.value))}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              <option value={300}>300 DPI (professional quality)</option>
              <option value={240}>240 DPI (standard prints)</option>
              <option value={150}>150 DPI (large format / posters)</option>
            </select>
          </div>

          {/* Results */}
          <div className="rounded-lg border border-border-primary bg-surface-primary p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">Print Quality:</span>
              <span className={`font-semibold capitalize ${qualityColors[checkResult.quality]}`}>
                {checkResult.quality} ({checkResult.currentDPI} DPI)
              </span>
            </div>

            <p className="mb-4 text-sm text-text-secondary">{checkResult.recommendation}</p>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Pixels needed at {targetDPI} DPI:</span>
                <span className="font-mono text-text-primary">
                  {checkResult.pixelsRequired.width} x {checkResult.pixelsRequired.height}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Your image:</span>
                <span className="font-mono text-text-primary">
                  {imageWidth} x {imageHeight}
                </span>
              </div>
              {checkResult.upscaleNeeded && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Upscale needed:</span>
                  <span className="font-mono text-accent-primary">
                    {checkResult.upscaleNeeded}x
                  </span>
                </div>
              )}
            </div>

            {checkResult.upscaleNeeded && (
              <a
                href="/?signup=1"
                className="mt-4 block w-full rounded-lg bg-accent-primary py-2 text-center font-medium text-white transition-colors hover:bg-accent-secondary"
              >
                Upscale {checkResult.upscaleNeeded}x Now
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Print Size Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Print size (inches)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={calcPrintWidth}
                onChange={e => setCalcPrintWidth(Number(e.target.value))}
                className="w-24 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
                step="0.1"
              />
              <span className="text-text-muted">x</span>
              <input
                type="number"
                value={calcPrintHeight}
                onChange={e => setCalcPrintHeight(Number(e.target.value))}
                className="w-24 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
                step="0.1"
              />
              <span className="text-sm text-text-muted">inches</span>
            </div>
          </div>

          {/* DPI Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              Print quality (DPI)
            </label>
            <select
              value={calcDPI}
              onChange={e => setCalcDPI(Number(e.target.value))}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              <option value={300}>300 DPI (professional quality)</option>
              <option value={240}>240 DPI (standard prints)</option>
              <option value={150}>150 DPI (large format / posters)</option>
              <option value={72}>72 DPI (screen only)</option>
            </select>
          </div>

          {/* Results */}
          <div className="rounded-lg border border-border-primary bg-surface-primary p-4">
            <h4 className="mb-3 font-medium text-text-primary">Required Image Size:</h4>

            <div className="mb-4 text-center">
              <span className="font-mono text-2xl text-accent-primary">
                {calcResult.width} x {calcResult.height}
              </span>
              <span className="ml-2 text-sm text-text-muted">pixels</span>
            </div>

            <div className="text-center text-sm text-text-secondary">
              {calcResult.megapixels} megapixels needed
            </div>

            <div className="mt-4 border-t border-border-primary pt-4">
              <p className="text-xs text-text-muted">
                Formula: {calcPrintWidth}&quot; x {calcDPI} DPI = {calcResult.width}px width
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintCalculator;
