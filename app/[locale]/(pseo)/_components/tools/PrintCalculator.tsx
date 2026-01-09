'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ICalculatorResult {
  pixelsRequired: { width: number; height: number };
  currentDPI: number;
  canPrint: boolean;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor';
  upscaleNeeded: number | null;
  recommendation: string;
}

const COMMON_PRINT_SIZES = (t: (key: string) => string) => [
  { label: t('presetSizes.4x6'), width: 4, height: 6, key: '4x6' },
  { label: t('presetSizes.5x7'), width: 5, height: 7, key: '5x7' },
  { label: t('presetSizes.8x10'), width: 8, height: 10, key: '8x10' },
  { label: t('presetSizes.11x14'), width: 11, height: 14, key: '11x14' },
  { label: t('presetSizes.16x20'), width: 16, height: 20, key: '16x20' },
  { label: t('presetSizes.20x24'), width: 20, height: 24, key: '20x24' },
  { label: t('presetSizes.24x36'), width: 24, height: 36, key: '24x36' },
  { label: t('presetSizes.a4'), width: 8.27, height: 11.69, key: 'a4' },
  { label: t('presetSizes.a3'), width: 11.69, height: 16.54, key: 'a3' },
  { label: t('custom'), width: 0, height: 0, key: 'custom' },
];

export function PrintCalculator(): React.ReactElement {
  const t = useTranslations('pseo-tools.printCalculator');
  const [mode, setMode] = useState<'check' | 'calculate'>('check');

  // Mode: Check if image can print at size
  const [imageWidth, setImageWidth] = useState<number>(1920);
  const [imageHeight, setImageHeight] = useState<number>(1080);
  const [selectedSize, setSelectedSize] = useState<string>(t('presetSizes.8x10'));
  const [customWidth, setCustomWidth] = useState<number>(8);
  const [customHeight, setCustomHeight] = useState<number>(10);
  const [targetDPI, setTargetDPI] = useState<number>(300);

  // Mode: Calculate pixels needed
  const [calcPrintWidth, setCalcPrintWidth] = useState<number>(8);
  const [calcPrintHeight, setCalcPrintHeight] = useState<number>(10);
  const [calcDPI, setCalcDPI] = useState<number>(300);

  const printSizes = useMemo(() => COMMON_PRINT_SIZES(t), [t]);

  // Initialize selectedSize when printSizes becomes available
  useEffect(() => {
    if (printSizes.length > 0 && selectedSize === t('presetSizes.8x10')) {
      setSelectedSize(printSizes[2].label);
    }
  }, []);

  const printSize = useMemo(() => {
    const custom = t('custom');
    if (selectedSize === custom) {
      return { width: customWidth, height: customHeight };
    }
    return printSizes.find(s => s.label === selectedSize) || { width: 8, height: 10 };
  }, [selectedSize, customWidth, customHeight, t, printSizes]);

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
      recommendation = t('recommendations.excellent');
    } else if (currentDPI >= 240) {
      quality = 'good';
      recommendation = t('recommendations.good');
    } else if (currentDPI >= 150) {
      quality = 'acceptable';
      recommendation = t('recommendations.acceptable');
    } else {
      quality = 'poor';
      canPrint = false;
      recommendation = t('recommendations.poor');
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
  }, [imageWidth, imageHeight, printSize, targetDPI, t]);

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
      <h3 className="mb-4 text-xl font-semibold text-text-primary">{t('title')}</h3>

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
          {t('checkMyImage')}
        </button>
        <button
          onClick={() => setMode('calculate')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'calculate'
              ? 'bg-accent-primary text-white'
              : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('calculatePixelsNeeded')}
        </button>
      </div>

      {mode === 'check' ? (
        <div className="space-y-6">
          {/* Image Dimensions Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              {t('imageDimensionsLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={imageWidth}
                onChange={e => setImageWidth(Number(e.target.value))}
                className="w-28 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
              />
              <span className="text-text-muted">{t('pixelsSeparator')}</span>
              <input
                type="number"
                value={imageHeight}
                onChange={e => setImageHeight(Number(e.target.value))}
                className="w-28 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
              />
              <span className="text-sm text-text-muted">{t('pixelsLabel')}</span>
            </div>
          </div>

          {/* Print Size Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              {t('desiredPrintSizeLabel')}
            </label>
            <select
              value={selectedSize}
              onChange={e => setSelectedSize(e.target.value)}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              {printSizes.map(size => (
                <option key={size.key} value={size.label}>
                  {size.label}
                </option>
              ))}
            </select>

            {selectedSize === t('custom') && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  value={customWidth}
                  onChange={e => setCustomWidth(Number(e.target.value))}
                  className="w-20 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                  min="1"
                  step="0.1"
                />
                <span className="text-text-muted">{t('pixelsSeparator')}</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={e => setCustomHeight(Number(e.target.value))}
                  className="w-20 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                  min="1"
                  step="0.1"
                />
                <span className="text-sm text-text-muted">{t('inches')}</span>
              </div>
            )}
          </div>

          {/* Target DPI */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">{t('targetDpiLabel')}</label>
            <select
              value={targetDPI}
              onChange={e => setTargetDPI(Number(e.target.value))}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              <option value={300}>{t('dpi300Professional')}</option>
              <option value={240}>{t('dpi240Standard')}</option>
              <option value={150}>{t('dpi150LargeFormat')}</option>
              <option value={72}>{t('dpi72ScreenOnly')}</option>
            </select>
          </div>

          {/* Results */}
          <div className="rounded-lg border border-border-primary bg-surface-primary p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('printQualityLabel')}</span>
              <span className={`font-semibold capitalize ${qualityColors[checkResult.quality]}`}>
                {t(`quality.${checkResult.quality}`)} ({checkResult.currentDPI} DPI)
              </span>
            </div>

            <p className="mb-4 text-sm text-text-secondary">{checkResult.recommendation}</p>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">{t('pixelsNeededAt', { dpi: targetDPI })}</span>
                <span className="font-mono text-text-primary">
                  {checkResult.pixelsRequired.width} x {checkResult.pixelsRequired.height}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('yourImage')}</span>
                <span className="font-mono text-text-primary">
                  {imageWidth} x {imageHeight}
                </span>
              </div>
              {checkResult.upscaleNeeded && (
                <div className="flex justify-between">
                  <span className="text-text-muted">{t('upscaleNeeded')}</span>
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
                {t('upscaleNow', { factor: checkResult.upscaleNeeded })}
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Print Size Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              {t('printSizeLabel')}
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
              <span className="text-text-muted">{t('pixelsSeparator')}</span>
              <input
                type="number"
                value={calcPrintHeight}
                onChange={e => setCalcPrintHeight(Number(e.target.value))}
                className="w-24 rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
                min="1"
                step="0.1"
              />
              <span className="text-sm text-text-muted">{t('inches')}</span>
            </div>
          </div>

          {/* DPI Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              {t('printQualityDpiLabel')}
            </label>
            <select
              value={calcDPI}
              onChange={e => setCalcDPI(Number(e.target.value))}
              className="w-full rounded-lg border border-border-primary bg-surface-tertiary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-none"
            >
              <option value={300}>{t('dpi300Professional')}</option>
              <option value={240}>{t('dpi240Standard')}</option>
              <option value={150}>{t('dpi150LargeFormat')}</option>
              <option value={72}>{t('dpi72ScreenOnly')}</option>
            </select>
          </div>

          {/* Results */}
          <div className="rounded-lg border border-border-primary bg-surface-primary p-4">
            <h4 className="mb-3 font-medium text-text-primary">{t('requiredImageSize')}</h4>

            <div className="mb-4 text-center">
              <span className="font-mono text-2xl text-accent-primary">
                {calcResult.width} {t('pixelsSeparator')} {calcResult.height}
              </span>
              <span className="ml-2 text-sm text-text-muted">{t('pixelsLabel')}</span>
            </div>

            <div className="text-center text-sm text-text-secondary">
              {t('megapixelsNeeded', { megapixels: calcResult.megapixels })}
            </div>

            <div className="mt-4 border-t border-border-primary pt-4">
              <p className="text-xs text-text-muted">
                {t('formula')}: {calcPrintWidth}&quot; x {calcDPI} DPI = {calcResult.width}px {t('width')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintCalculator;
