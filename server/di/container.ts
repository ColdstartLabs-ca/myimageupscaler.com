/**
 * Dependency Injection Container
 *
 * Uses tsyringe for manual service registration.
 * We use manual registration instead of decorators to avoid Next.js build issues.
 *
 * Services are registered as singletons by default.
 * Registration is lazy to avoid issues with test mocks.
 */

import { container } from 'tsyringe';

// Import service interfaces
import type { ISubscriptionCredits } from '../interfaces/ISubscriptionCredits';
import type { IEmailService } from '../interfaces/IEmailService';

// Track whether services are registered
let servicesRegistered = false;

/**
 * Register services in the DI container
 * This is done lazily to avoid running before test mocks are set up
 */
function registerServices() {
  if (servicesRegistered) {
    return;
  }

  // Import services (will be refactored for DI)
  // Import here to avoid running before test mocks are set up
  const { SubscriptionCreditsService } = require('../services/SubscriptionCredits');
  const { EmailService } = require('../services/email.service');

  // Register services as singletons
  // Manual registration instead of decorators for Next.js compatibility
  // We use container.registerInstance to register singleton instances
  container.registerInstance('ISubscriptionCredits' as never, new SubscriptionCreditsService());
  container.registerInstance('IEmailService' as never, new EmailService());

  servicesRegistered = true;
}

/**
 * Get a service from the DI container
 *
 * @example
 * ```ts
 * const creditsService = getService<ISubscriptionCredits>('ISubscriptionCredits');
 * ```
 */
export function getService<T>(token: string): T {
  registerServices(); // Lazy registration
  return container.resolve<T>(token);
}

/**
 * The DI container for direct access if needed
 */
export { container };
