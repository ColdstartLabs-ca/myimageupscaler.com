import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import interactiveTools from '@/app/seo/data/interactive-tools.json';

const { mockTrack, mockSave, mockPush, mockPrepare, authState } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockSave: vi.fn().mockResolvedValue(undefined),
  mockPush: vi.fn(),
  mockPrepare: vi.fn(),
  authState: { isAuthenticated: false },
}));

vi.mock('@client/analytics/analyticsClient', () => ({ analytics: { track: mockTrack } }));
vi.mock('@client/utils/tool-image-handoff', () => ({ saveToolHandoffImage: mockSave }));
vi.mock('@client/utils/authRedirectManager', () => ({ prepareAuthRedirect: mockPrepare }));
vi.mock('@client/store/userStore', () => ({
  useUserStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector(authState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { PostToolUpsell } from '@/app/(pseo)/_components/tools/PostToolUpsell';

const TOOLS_DIR = path.join(process.cwd(), 'app/(pseo)/_components/tools');
const TEMPLATE = path.join(
  process.cwd(),
  'app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate.tsx'
);
const read = (file: string): string => readFileSync(file, 'utf8');

function registeredToolComponents(): string[] {
  const source = read(TEMPLATE);
  const block = source.slice(
    source.indexOf('TOOL_COMPONENTS'),
    source.indexOf('};', source.indexOf('TOOL_COMPONENTS'))
  );
  return [...block.matchAll(/^\s+(\w+),$/gm)].map(match => match[1]);
}

/** Every widget mounted on a tool page, including the standalone bulk pages. */
const LIVE_TOOLS = [
  ...new Set([...registeredToolComponents(), 'BulkImageCompressor', 'BulkImageResizer']),
];

/** The flat pre-revamp primary button. Tool CTAs use `gradient-cta` instead. */
const FLAT_PRIMARY =
  /px-(5|6)[^"`]*bg-accent text-(white|text-primary) font-medium rounded-lg hover:bg-accent/;

describe('tool page CTAs', () => {
  test('every data toolComponent is a registered widget', () => {
    const registered = new Set(registeredToolComponents());
    const used = new Set(
      (interactiveTools.pages as { toolComponent?: string }[])
        .map(page => page.toolComponent)
        .filter((name): name is string => Boolean(name))
    );
    expect(registered.size).toBeGreaterThan(10);
    for (const name of used) expect(registered.has(name), name).toBe(true);
  });

  test.each(LIVE_TOOLS)('%s offers the AI upscaler upsell after a result', name => {
    const source = read(path.join(TOOLS_DIR, `${name}.tsx`));
    expect(
      source.includes('<PostToolUpsell') || source.includes('<InteractiveTool'),
      `${name} must render PostToolUpsell or wrap InteractiveTool`
    ).toBe(true);
  });

  test.each([...LIVE_TOOLS, 'InteractiveTool'])('%s primary buttons use the gradient CTA', name => {
    const source = read(path.join(TOOLS_DIR, `${name}.tsx`));
    expect(source).not.toMatch(FLAT_PRIMARY);
  });

  test.each([...LIVE_TOOLS, 'InteractiveTool'])(
    '%s action rows stack on mobile so gradient buttons never clip their label',
    name => {
      // shine-effect sets overflow:hidden, so a squeezed flex-1 button cuts its text.
      const source = read(path.join(TOOLS_DIR, `${name}.tsx`));
      const squeezedRows = [...source.matchAll(/<div className="flex gap-3( mt-6)?">/g)].filter(
        match => source.slice(match.index, match.index + 800).includes('gradient-cta')
      );
      expect(squeezedRows).toHaveLength(0);
    }
  );

  test('page-level PostToolCTA uses the gradient CTA style', () => {
    const source = read(TEMPLATE);
    const cta = source.slice(
      source.indexOf('function PostToolCTA'),
      source.indexOf('interface IInteractiveToolPageTemplateProps')
    );
    expect(cta).toContain('gradient-cta');
    expect(cta).toContain('href="/?signup=1"');
  });
});

describe('PostToolUpsell without an image result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
  });

  test('signed-out click keeps the dashboard intent and skips the handoff', async () => {
    render(<PostToolUpsell toolId="image-to-text" />);
    fireEvent.click(screen.getByRole('button', { name: /upscale your images with ai/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/?signup=1'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockPrepare).toHaveBeenCalledWith('tool_upsell', { returnTo: '/dashboard' });
    expect(mockTrack).toHaveBeenCalledWith('post_tool_upsell_clicked', {
      tool: 'image-to-text',
      outputType: 'none',
      outputBytes: 0,
    });
  });

  test('signed-in click goes straight to the dashboard', async () => {
    authState.isAuthenticated = true;
    render(<PostToolUpsell toolId="image-to-pdf" />);
    fireEvent.click(screen.getByRole('button', { name: /upscale your images with ai/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  test('keeps the free-offer framing', () => {
    render(<PostToolUpsell toolId="image-to-pdf" />);
    expect(screen.getByText(/free to start, no credit card required/i)).toBeVisible();
  });
});
