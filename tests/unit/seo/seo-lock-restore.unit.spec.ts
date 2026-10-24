import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { restoreSeoLockEntry } from '@/scripts/seo/seo-lock-restore';

describe('reviewable SEO lock revert', () => {
  it('restores one historical entry and preserves all other current entries', () => {
    const repo = mkdtempSync(join(tmpdir(), 'seo-lock-restore-'));
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    const path = join(repo, 'content/seo-lock.json');
    try {
      mkdirSync(join(repo, 'content'));
      git(['init', '-q']);
      git(['config', 'user.name', 'Fixture']);
      git(['config', 'user.email', 'fixture@example.com']);
      git(['config', 'commit.gpgsign', 'false']);
      writeFileSync(path, JSON.stringify({ '/restore': { title: 'Old approved' } }));
      git(['add', 'content/seo-lock.json']);
      git(['commit', '-qm', 'old']);
      const previous = git(['rev-parse', 'HEAD']);
      writeFileSync(
        path,
        JSON.stringify({ '/restore': { title: 'Current' }, '/keep': { title: 'New winner' } })
      );
      git(['add', 'content/seo-lock.json']);
      git(['commit', '-qm', 'current']);
      const clean = readFileSync(path, 'utf8');
      restoreSeoLockEntry('/restore', previous, repo);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
        '/restore': { title: 'Old approved' },
        '/keep': { title: 'New winner' },
      });
      const edited = readFileSync(path, 'utf8');
      expect(() => restoreSeoLockEntry('/restore', previous, repo)).toThrow('uncommitted');
      expect(readFileSync(path, 'utf8')).toBe(edited);
      writeFileSync(path, JSON.stringify({ '/staged': { title: 'Keep staged work' } }));
      git(['add', 'content/seo-lock.json']);
      writeFileSync(path, clean);
      expect(() => restoreSeoLockEntry('/restore', previous, repo)).toThrow('uncommitted');
      expect(readFileSync(path, 'utf8')).toBe(clean);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('rejects revision expressions before invoking git or writing files', () => {
    expect(() => restoreSeoLockEntry('/restore', 'HEAD~1', '/nonexistent')).toThrow('40-character');
  });
});
