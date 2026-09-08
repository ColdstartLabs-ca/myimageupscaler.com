import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ADDITIONAL_OPTIONS } from '@/shared/types/coreflow.types';
import { EnhancementOptions } from '../EnhancementOptions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));

describe('EnhancementOptions face selection', () => {
  const onChange = vi.fn();
  const onOpenCustomInstructions = vi.fn();
  const onUpgradeClick = vi.fn();
  const onSelectPaidFaceTier = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderOptions(overrides: Partial<React.ComponentProps<typeof EnhancementOptions>> = {}) {
    return render(
      <EnhancementOptions
        options={DEFAULT_ADDITIONAL_OPTIONS}
        onChange={onChange}
        onOpenCustomInstructions={onOpenCustomInstructions}
        selectedTier="quick"
        onUpgradeClick={onUpgradeClick}
        onSelectPaidFaceTier={onSelectPaidFaceTier}
        {...overrides}
      />
    );
  }

  it('opens the existing purchase flow for a free user', () => {
    renderOptions({ isFreeUser: true });

    fireEvent.click(screen.getByRole('button', { name: 'Enhance faces with Clarity Pro' }));

    expect(onSelectPaidFaceTier).toHaveBeenCalledOnce();
    expect(onUpgradeClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /enhance faces/i })).not.toBeInTheDocument();
  });

  it('selects the paid face tier without changing processing state', () => {
    renderOptions({ isFreeUser: false });

    fireEvent.click(screen.getByRole('button', { name: 'Enhance faces with Clarity Pro' }));

    expect(onSelectPaidFaceTier).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides face selection for incompatible editing tiers', () => {
    renderOptions({ selectedTier: 'face-pro' });

    expect(
      screen.queryByRole('button', { name: 'Enhance faces with Clarity Pro' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /enhance faces/i })).not.toBeInTheDocument();
  });
});
