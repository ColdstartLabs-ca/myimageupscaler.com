import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const MAX_ASSET_BYTES = 1024 * 1024;

function findOversizedFiles(directory: string): string[] {
  const oversized: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      oversized.push(...findOversizedFiles(entryPath));
    } else if (entry.isFile() && fs.statSync(entryPath).size > MAX_ASSET_BYTES) {
      oversized.push(path.relative(PUBLIC_DIR, entryPath));
    }
  }

  return oversized;
}

describe('public asset weight', () => {
  it('should ship no public asset over 1MB', () => {
    expect(findOversizedFiles(PUBLIC_DIR)).toEqual([]);
  });
});
