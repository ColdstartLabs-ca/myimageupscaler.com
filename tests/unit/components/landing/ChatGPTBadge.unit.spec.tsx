/**
 * ChatGPT Badge Component Unit Tests
 * Tests for the AI referral badge shown to visitors from ChatGPT/Perplexity/Claude/SGE
 *
 * PRD: ChatGPT Traffic Optimization - Phase 2
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatGPTBadge } from '@client/components/landing/ChatGPTBadge';

// Mock lucide-react Bot icon
vi.mock('lucide-react', () => ({
  Bot: () => <svg data-testid="bot-icon" />,
}));

describe('ChatGPTBadge', () => {
  describe('ChatGPT source', () => {
    it('should render with ChatGPT label', () => {
      render(<ChatGPTBadge source="chatgpt" />);
      expect(screen.getByText('Recommended by ChatGPT')).toBeInTheDocument();
    });

    it('should have green gradient for ChatGPT', () => {
      const { container } = render(<ChatGPTBadge source="chatgpt" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('green');
    });
  });

  describe('Perplexity source', () => {
    it('should render with Perplexity label', () => {
      render(<ChatGPTBadge source="perplexity" />);
      expect(screen.getByText('Recommended by Perplexity')).toBeInTheDocument();
    });

    it('should have blue gradient for Perplexity', () => {
      const { container } = render(<ChatGPTBadge source="perplexity" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('blue');
    });
  });

  describe('Claude source', () => {
    it('should render with Claude label', () => {
      render(<ChatGPTBadge source="claude" />);
      expect(screen.getByText('Recommended by Claude')).toBeInTheDocument();
    });

    it('should have orange gradient for Claude', () => {
      const { container } = render(<ChatGPTBadge source="claude" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('orange');
    });
  });

  describe('Google SGE source', () => {
    it('should render with AI Overview label', () => {
      render(<ChatGPTBadge source="google_sge" />);
      expect(screen.getByText('AI Overview Recommended')).toBeInTheDocument();
    });

    it('should have purple gradient for Google SGE', () => {
      const { container } = render(<ChatGPTBadge source="google_sge" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('purple');
    });
  });

  describe('Common badge features', () => {
    it('should include Bot icon for all sources', () => {
      const { container } = render(<ChatGPTBadge source="chatgpt" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should have backdrop blur styling', () => {
      const { container } = render(<ChatGPTBadge source="chatgpt" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('backdrop-blur');
    });

    it('should have fade-in animation', () => {
      const { container } = render(<ChatGPTBadge source="chatgpt" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('animate-fade-in');
    });
  });
});
