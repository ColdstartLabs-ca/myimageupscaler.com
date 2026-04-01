import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Ensures Playwright browsers are installed before tests run.
 * Fixes the recurring "Executable doesn't exist" error when
 * the browser cache gets cleared (WSL resets, disk cleanup, etc.)
 */
export default function globalSetup() {
  // Ask Playwright where it expects the headless shell
  try {
    const dryRun = execSync('npx playwright install --dry-run chromium-headless-shell 2>&1', {
      encoding: 'utf-8',
    });

    const match = dryRun.match(/Install location:\s+(.+)/);
    if (match && existsSync(match[1].trim())) {
      return; // Browser already installed
    }
  } catch {
    // Fall through to install
  }

  console.log('\n⚠️  Playwright browsers not found — installing...');
  execSync('npx playwright install chromium chromium-headless-shell', {
    stdio: 'inherit',
  });
  console.log('✅ Browsers installed.\n');
}
