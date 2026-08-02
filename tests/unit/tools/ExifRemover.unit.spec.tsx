import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const interactiveToolTemplateSource = readFileSync(
  join(process.cwd(), 'app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate.tsx'),
  'utf8'
);

vi.mock('exifr', () => ({
  default: { parse: vi.fn().mockResolvedValue(null) },
}));

vi.mock('@/app/(pseo)/_components/ui/FileUpload', () => ({
  FileUpload: ({ onFileSelect: _onFileSelect }: { onFileSelect: unknown }) =>
    React.createElement('div', { 'data-testid': 'file-upload' }, 'Drop image here'),
}));

describe('ExifRemover', () => {
  it('should render upload area', async () => {
    const { ExifRemover } = await import('@/app/(pseo)/_components/tools/ExifRemover');
    render(<ExifRemover />);
    expect(screen.getByText(/Remove Metadata From Photo/i)).toBeInTheDocument();
  });

  it('should be registered in TOOL_COMPONENTS', () => {
    expect(interactiveToolTemplateSource).toMatch(
      /export const TOOL_COMPONENTS[\s\S]*?\bExifRemover,/
    );
  });
});
