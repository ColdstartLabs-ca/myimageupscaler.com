import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../..');

describe('Footer category coverage', () => {
  const footerSource = readFileSync(join(ROOT, 'client/components/layout/Footer.tsx'), 'utf-8');

  it('Footer should link to /free', () => {
    expect(footerSource).toMatch(/\/free/);
  });

  it('Footer should link to /alternatives', () => {
    expect(footerSource).toMatch(/\/alternatives/);
  });

  it('Footer should not have duplicate Tools & Guides sections', () => {
    const toolsGuidesMatches = footerSource.match(/Tools & Guides/g);
    expect(toolsGuidesMatches?.length).toBe(1);
  });
});
