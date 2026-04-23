import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

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

  it('should be registered in TOOL_COMPONENTS', async () => {
    const { TOOL_COMPONENTS } =
      await import('@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate');
    expect(TOOL_COMPONENTS['ExifRemover']).toBeDefined();
  });
});
