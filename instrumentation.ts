/**
 * Next.js Instrumentation
 *
 * This file runs when the Next.js server starts. Used here to import reflect-metadata
 * which is required by tsyringe for dependency injection.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import reflect-metadata for tsyringe DI on server-side
    await import('reflect-metadata');
  }
}
