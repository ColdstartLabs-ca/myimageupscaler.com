import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpscaleFactorSelector } from '../UpscaleFactorSelector';

describe('UpscaleFactorSelector - PRD: True Image Upscaling', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Phase 3: Dynamic Scale Options Based on Tier', () => {
    describe('When all scales are available', () => {
      it('should show all scale options (2x, 4x, 8x)', () => {
        render(
          <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4, 8]} />
        );

        expect(screen.getByText('2x')).toBeInTheDocument();
        expect(screen.getByText('4x')).toBeInTheDocument();
        expect(screen.getByText('8x')).toBeInTheDocument();
      });

      it('should have 3 columns for all scale options', () => {
        const { container } = render(
          <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4, 8]} />
        );

        // Check grid columns class
        const grid = container.querySelector('.grid');
        expect(grid?.className).toContain('grid-cols-3');
      });
    });

    describe('Quick/Face Restore/Ultra Tiers (2x, 4x only)', () => {
      it('should only show 2x and 4x options', () => {
        render(
          <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4]} />
        );

        expect(screen.getByText('2x')).toBeInTheDocument();
        expect(screen.getByText('4x')).toBeInTheDocument();
        expect(screen.queryByText('8x')).not.toBeInTheDocument();
      });

      it('should have 2 columns for 2 scale options', () => {
        const { container } = render(
          <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4]} />
        );

        const grid = container.querySelector('.grid');
        expect(grid?.className).toContain('grid-cols-2');
      });
    });

    describe('Enhancement-Only Tiers (no scale support)', () => {
      it('should show enhancement-only message instead of buttons', () => {
        render(<UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[]} />);

        expect(screen.queryByText('2x')).not.toBeInTheDocument();
        expect(screen.queryByText('4x')).not.toBeInTheDocument();
        expect(screen.queryByText('8x')).not.toBeInTheDocument();
        expect(
          screen.getByText('This tier is enhancement-only and does not change image dimensions.')
        ).toBeInTheDocument();
      });

      it('should display label when enhancement-only', () => {
        render(<UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[]} />);

        expect(screen.getByText('Upscale Factor')).toBeInTheDocument();
      });
    });

    describe('Single Scale Available', () => {
      it('should show only one scale option', () => {
        render(<UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2]} />);

        expect(screen.getByText('2x')).toBeInTheDocument();
        expect(screen.queryByText('4x')).not.toBeInTheDocument();
        expect(screen.queryByText('8x')).not.toBeInTheDocument();
      });

      it('should use 2 columns even for single option', () => {
        const { container } = render(
          <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2]} />
        );

        const grid = container.querySelector('.grid');
        expect(grid?.className).toContain('grid-cols-2');
      });
    });
  });

  describe('Auto-Reset When Scale Becomes Unavailable', () => {
    it('should auto-reset to first available scale when current scale is unavailable', () => {
      const { rerender } = render(
        <UpscaleFactorSelector scale={8} onChange={mockOnChange} availableScales={[2, 4, 8]} />
      );

      // Initially, all scales are available
      expect(screen.getByText('8x')).toBeInTheDocument();

      // Reset mock to track new calls
      mockOnChange.mockClear();

      // Now change to only 2x and 4x available (like switching from hd-upscale to quick)
      rerender(
        <UpscaleFactorSelector
          scale={8} // Still has 8 selected, but it's no longer available
          onChange={mockOnChange}
          availableScales={[2, 4]}
        />
      );

      // Should call onChange to reset to 4x (preferred) or 2x
      expect(mockOnChange).toHaveBeenCalled();
      const newScale = mockOnChange.mock.calls[0][0];
      expect([2, 4]).toContain(newScale);
    });

    it('should prefer 4x when auto-resetting (if available)', () => {
      const { rerender } = render(
        <UpscaleFactorSelector scale={8} onChange={mockOnChange} availableScales={[2, 4]} />
      );

      mockOnChange.mockClear();

      rerender(
        <UpscaleFactorSelector scale={8} onChange={mockOnChange} availableScales={[2, 4]} />
      );

      expect(mockOnChange).toHaveBeenCalledWith(4);
    });

    it('should fall back to 2x when 4x is not available', () => {
      const { rerender } = render(
        <UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[2]} />
      );

      mockOnChange.mockClear();

      rerender(<UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[2]} />);

      expect(mockOnChange).toHaveBeenCalledWith(2);
    });

    it('should not auto-reset when current scale is still available', () => {
      const { rerender } = render(
        <UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[2, 4]} />
      );

      mockOnChange.mockClear();

      // Update props but 4x is still available
      rerender(
        <UpscaleFactorSelector scale={4} onChange={mockOnChange} availableScales={[2, 4]} />
      );

      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Scale Selection Interaction', () => {
    it('should call onChange when scale is clicked', () => {
      render(
        <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4, 8]} />
      );

      const fourXButton = screen.getByText('4x');
      fireEvent.click(fourXButton);

      expect(mockOnChange).toHaveBeenCalledWith(4);
    });

    it('should be disabled when disabled prop is true', () => {
      render(
        <UpscaleFactorSelector
          scale={2}
          onChange={mockOnChange}
          availableScales={[2, 4, 8]}
          disabled={true}
        />
      );

      const twoXButton = screen.getByRole('button', { name: '2x' });
      expect(twoXButton).toBeDisabled();
    });

    it('should not be disabled by default', () => {
      render(
        <UpscaleFactorSelector scale={2} onChange={mockOnChange} availableScales={[2, 4, 8]} />
      );

      const twoXButton = screen.getByRole('button', { name: '2x' });
      expect(twoXButton).not.toBeDisabled();
    });
  });

  describe('Backward Compatibility', () => {
    it('should show all scales when availableScales is not provided', () => {
      render(
        <UpscaleFactorSelector
          scale={2}
          onChange={mockOnChange}
          // availableScales not provided - should show all
        />
      );

      expect(screen.getByText('2x')).toBeInTheDocument();
      expect(screen.getByText('4x')).toBeInTheDocument();
      expect(screen.getByText('8x')).toBeInTheDocument();
    });
  });
});
