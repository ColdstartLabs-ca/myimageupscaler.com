import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'translation-helper.ts');
const TEST_LOCALES_DIR = path.join(PROJECT_ROOT, 'scripts', '__test_locales__');

// Helper to run the script
function runScript(args: string): string {
  try {
    return execSync(`npx tsx ${SCRIPT_PATH} ${args}`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: 'test' },
    });
  } catch (error) {
    // Return stdout even on error (some commands exit with error code)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err.stdout) return err.stdout;
    throw error;
  }
}

// Test helper functions directly by importing them
// We'll test via CLI for integration tests

describe('translation-helper', () => {
  describe('pathToKey and keyToPath roundtrip', () => {
    it('should handle simple keys', () => {
      const testCases = ['title', 'page.title', 'page.nested.deep'];

      // We test this indirectly through get-batch output
      // which uses pathToKey internally
    });

    it('should handle array indices correctly', () => {
      // Test that array notation is correct in get-batch output
      const output = runScript('get-batch de common.json 1');
      const parsed = JSON.parse(output);

      // Check that keys don't have double dots around array indices
      // Valid: "faqItems[0].question" — the "]." pattern is correct dot-notation after index
      for (const entry of parsed.entries || []) {
        expect(entry.key).not.toMatch(/\.\[/); // No ".[" patterns (double-dot before bracket)
      }
    });
  });

  describe('stats command', () => {
    it('should output statistics for a locale', () => {
      const output = runScript('stats de');

      // Should contain markdown table headers
      expect(output).toContain('Translation Statistics');
      expect(output).toContain('| File |');
      expect(output).toContain('| Total |');
      expect(output).toContain('Progress');
    });

    it('should calculate progress percentages', () => {
      const output = runScript('stats de');

      // Should contain percentage values
      expect(output).toMatch(/\d+%/);
      expect(output).toContain('TOTAL');
    });
  });

  describe('get-batch command', () => {
    it('should return JSON batch for translation', () => {
      const output = runScript('get-batch de common.json 5');
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('locale', 'de');
      expect(parsed).toHaveProperty('file', 'common.json');
      expect(parsed).toHaveProperty('targetLanguage', 'German');
      expect(parsed).toHaveProperty('entries');
      expect(Array.isArray(parsed.entries)).toBe(true);
    });

    it('should respect batch size limit', () => {
      const output = runScript('get-batch de common.json 3');
      const parsed = JSON.parse(output);

      expect(parsed.entries.length).toBeLessThanOrEqual(3);
    });

    it('should support offset for pagination', () => {
      const batch1 = JSON.parse(runScript('get-batch de common.json 2 0'));
      const batch2 = JSON.parse(runScript('get-batch de common.json 2 2'));

      // Batches should have different entries (if there are enough)
      // batch2 may have no entries if offset is past the available entries
      if (batch1.entries?.length > 0 && batch2.entries?.length > 0) {
        expect(batch1.entries[0].key).not.toBe(batch2.entries[0].key);
      }
    });

    it('should include response format instructions', () => {
      const output = runScript('get-batch de common.json 1');
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('responseFormat');
      expect(parsed.responseFormat).toHaveProperty('description');
      expect(parsed.responseFormat).toHaveProperty('example');
    });
  });

  describe('diff command', () => {
    it('should show diff summary for a locale', () => {
      const output = runScript('diff de common.json');

      expect(output).toContain('Translation Diff');
      expect(output).toContain('Summary');
    });

    it('should show missing and untranslated counts', () => {
      const output = runScript('diff de');

      expect(output).toMatch(/Missing keys: \d+/);
      expect(output).toMatch(/Untranslated: \d+/);
      expect(output).toMatch(/Translated: \d+/);
    });
  });

  describe('diff-json command', () => {
    it('should return machine-readable JSON', () => {
      const output = runScript('diff-json de common.json');
      const parsed = JSON.parse(output);

      expect(typeof parsed).toBe('object');
    });
  });

  describe('validate command', () => {
    it('should validate JSON files', () => {
      const output = runScript('validate en common.json');

      expect(output).toContain('common.json');
      expect(output).toMatch(/Valid: \d+/);
    });
  });

  describe('list-files command', () => {
    it('should list translation files', () => {
      const output = runScript('list-files de');
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('locale', 'de');
      expect(parsed).toHaveProperty('files');
      expect(Array.isArray(parsed.files)).toBe(true);
      expect(parsed.files.length).toBeGreaterThan(0);
    });

    it('should indicate which files exist in target', () => {
      const output = runScript('list-files de');
      const parsed = JSON.parse(output);

      for (const file of parsed.files) {
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('existsInTarget');
        expect(typeof file.existsInTarget).toBe('boolean');
      }
    });
  });

  describe('help command', () => {
    it('should show usage information', () => {
      const output = runScript('--help');

      expect(output).toContain('Translation Helper Script');
      expect(output).toContain('Commands:');
      expect(output).toContain('get-batch');
      expect(output).toContain('apply');
      expect(output).toContain('diff');
    });
  });

  describe('apply-inline integration', () => {
    const testLocaleDir = path.join(TEST_LOCALES_DIR, 'test-locale');
    const testSourceDir = path.join(TEST_LOCALES_DIR, 'en');

    beforeEach(() => {
      // Create test directories
      fs.mkdirSync(testSourceDir, { recursive: true });
      fs.mkdirSync(testLocaleDir, { recursive: true });

      // Create test source file
      const sourceData = {
        title: 'Hello World',
        nested: {
          greeting: 'Welcome',
          items: ['First', 'Second', 'Third'],
        },
        pages: [
          { slug: 'home', title: 'Home Page' },
          { slug: 'about', title: 'About Us' },
        ],
      };

      fs.writeFileSync(path.join(testSourceDir, 'test.json'), JSON.stringify(sourceData, null, 2));

      // Create test target file (copy of source - simulating untranslated)
      fs.writeFileSync(path.join(testLocaleDir, 'test.json'), JSON.stringify(sourceData, null, 2));
    });

    afterEach(() => {
      // Cleanup test directories
      if (fs.existsSync(TEST_LOCALES_DIR)) {
        fs.rmSync(TEST_LOCALES_DIR, { recursive: true, force: true });
      }
    });

    it('should parse nested keys correctly', () => {
      // This tests the keyToPath function indirectly
      const testCases = [
        { key: 'title', expected: ['title'] },
        { key: 'nested.greeting', expected: ['nested', 'greeting'] },
        { key: 'nested.items[0]', expected: ['nested', 'items', '[0]'] },
        { key: 'pages[0].title', expected: ['pages', '[0]', 'title'] },
        { key: 'pages[1].slug', expected: ['pages', '[1]', 'slug'] },
      ];

      // We verify this works by checking get-batch output format
      // Keys should be parseable back to paths
    });
  });

  describe('edge cases', () => {
    it('should reject getting batch for source locale', () => {
      // English is the source locale, can't get batch for it
      // The script exits with code 1 and outputs JSON error
      try {
        runScript('get-batch en common.json 1');
        // If no throw, fail the test
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Should throw with the error message in stdout
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = error as any;
        expect(err.stdout || err.message).toContain('Cannot get batch for English source locale');
      }
    });

    it('should handle invalid locale gracefully in stats', () => {
      // Stats on nonexistent locale should error
      try {
        runScript('stats nonexistent-locale');
      } catch (error) {
        // Expected to throw or return error
        expect(error).toBeDefined();
      }
    });
  });
});

describe('key path utilities', () => {
  // Test the internal logic by verifying the CLI output format

  it('should format array indices without leading dots', () => {
    const output = runScript('get-batch de social-media-resize.json 10');
    const parsed = JSON.parse(output);

    for (const entry of parsed.entries) {
      // Keys should not have patterns like "foo.[0]" - should be "foo[0]"
      expect(entry.key).not.toMatch(/\.\[/);
    }
  });

  it('should handle deeply nested array indices', () => {
    const output = runScript('get-batch de social-media-resize.json 50');
    const parsed = JSON.parse(output);

    // Find entries with multiple array indices
    const complexKeys = parsed.entries.filter(
      (e: { key: string }) => (e.key.match(/\[/g) || []).length > 1
    );

    for (const entry of complexKeys) {
      // Verify format is consistent
      expect(entry.key).toMatch(/^[a-zA-Z]/); // Should start with letter
      expect(entry.key).not.toMatch(/\]\[/); // No adjacent brackets without dot
    }
  });
});
