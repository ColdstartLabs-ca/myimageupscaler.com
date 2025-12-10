/**
 * Handles post-authentication redirects.
 *
 * This module now delegates to the unified auth redirect manager
 * to provide consistent behavior across all auth flows.
 */
import { handleAuthRedirect } from '@client/utils/authRedirectManager';

/**
 * Main handler for post-authentication redirects.
 * Call this after a successful sign-in event.
 *
 * This is now a thin wrapper around the unified redirect manager.
 */
export async function handlePostAuthRedirect(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Skip redirects in test environment
  const isTestEnvironment =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TEST_ENV__ === true ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).playwrightTest === true;
  if (isTestEnvironment) {
    return;
  }

  // Delegate to the unified redirect manager
  await handleAuthRedirect();
}
