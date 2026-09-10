'use client';

import { analytics } from '@client/analytics/analyticsClient';
import {
  calculatePrintReadiness,
  type IPrintReadinessInput,
  type IPrintReadinessResult,
} from '@client/utils/print-readiness';
import { Calculator, CheckCircle2, AlertTriangle } from 'lucide-react';
import { FormEvent, ReactElement, useState } from 'react';

const DEFAULT_INPUT: IPrintReadinessInput = {
  pixelWidth: 2400,
  pixelHeight: 3000,
  printWidthInches: 8,
  printHeightInches: 10,
  targetPpi: 300,
};

export function PrintReadinessChecker(): ReactElement {
  const [input, setInput] = useState<IPrintReadinessInput>(DEFAULT_INPUT);
  const [result, setResult] = useState<IPrintReadinessResult>(() =>
    calculatePrintReadiness(DEFAULT_INPUT)
  );

  const updateNumber = (key: keyof IPrintReadinessInput, value: string): void => {
    const parsed = Number(value);
    setInput(current => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    try {
      const next = calculatePrintReadiness(input);
      setResult(next);
      analytics.track('print_readiness_checked', {
        pixelWidth: input.pixelWidth,
        pixelHeight: input.pixelHeight,
        printWidthInches: input.printWidthInches,
        printHeightInches: input.printHeightInches,
        targetPpi: input.targetPpi,
        effectivePpi: next.effectivePpi,
        requiredScale: next.requiredScale,
        ready: next.ready,
      });
    } catch {
      // Keep the last valid result; native numeric constraints explain invalid fields inline.
    }
  };

  return (
    <div className="not-prose my-10 rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
          <Calculator className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            Print readiness checker
          </p>
          <h3 className="mt-1 text-xl font-bold text-primary">Will these pixels print sharply?</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Enter the image dimensions and intended print size. The calculation happens entirely
            in your browser; no image upload is required.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField
          label="Pixel width"
          value={input.pixelWidth}
          onChange={value => updateNumber('pixelWidth', value)}
          step="1"
        />
        <NumberField
          label="Pixel height"
          value={input.pixelHeight}
          onChange={value => updateNumber('pixelHeight', value)}
          step="1"
        />
        <NumberField
          label="Print width (in)"
          value={input.printWidthInches}
          onChange={value => updateNumber('printWidthInches', value)}
          step="0.1"
        />
        <NumberField
          label="Print height (in)"
          value={input.printHeightInches}
          onChange={value => updateNumber('printHeightInches', value)}
          step="0.1"
        />
        <NumberField
          label="Target PPI"
          value={input.targetPpi}
          onChange={value => updateNumber('targetPpi', value)}
          step="1"
        />

        <button
          type="submit"
          className="sm:col-span-2 lg:col-span-5 inline-flex items-center justify-center gap-2 rounded-xl gradient-cta px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Check print readiness
        </button>
      </form>

      <div
        className="mt-5 rounded-xl border border-border bg-base/60 p-4"
        aria-live="polite"
        data-testid="print-readiness-result"
      >
        <div className="flex items-start gap-3">
          {result.ready ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold text-primary">
              {result.ready
                ? `Ready at about ${result.effectivePpi} PPI`
                : `About ${result.effectivePpi} PPI at this print size`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.ready
                ? `This meets your ${input.targetPpi} PPI target without enlargement.`
                : `To reach ${input.targetPpi} PPI, you need about ${result.requiredScale}× the current pixel dimensions.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step: string;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-primary">
      {label}
      <input
        type="number"
        min="0.1"
        step={step}
        required
        value={value}
        onChange={event => onChange(event.target.value)}
        className="rounded-lg border border-border bg-base px-3 py-2.5 text-primary outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}
