import type { IAnalyticsEventName, IUserIdentity } from '@server/analytics/types';
import type { IAnalyticsProvider } from './types';

/**
 * Multiplexer that fans out analytics events to all enabled providers.
 * If one provider fails, it logs the error and continues to the next.
 */
export class AnalyticsMultiplexer {
  private providers: IAnalyticsProvider[] = [];

  addProvider(provider: IAnalyticsProvider): void {
    this.providers.push(provider);
  }

  async initProvider(provider: IAnalyticsProvider, config: Record<string, unknown>): Promise<void> {
    try {
      await provider.init(config);
    } catch (err) {
      console.error(`[Analytics] Failed to init ${provider.name}:`, err);
    }
  }

  track(name: IAnalyticsEventName, properties: Record<string, unknown>): void {
    for (const provider of this.providers) {
      if (!provider.isEnabled()) continue;
      try {
        provider.track(name, properties);
      } catch (err) {
        console.error(`[Analytics] ${provider.name}.track failed:`, err);
      }
    }
  }

  async identify(identity: IUserIdentity & { email?: string }): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.isEnabled()) continue;
      try {
        await provider.identify(identity);
      } catch (err) {
        console.error(`[Analytics] ${provider.name}.identify failed:`, err);
      }
    }
  }

  trackPageView(path: string, properties: Record<string, unknown>): void {
    for (const provider of this.providers) {
      if (!provider.isEnabled()) continue;
      try {
        provider.trackPageView(path, properties);
      } catch (err) {
        console.error(`[Analytics] ${provider.name}.trackPageView failed:`, err);
      }
    }
  }

  reset(): void {
    for (const provider of this.providers) {
      try {
        provider.reset();
      } catch (err) {
        console.error(`[Analytics] ${provider.name}.reset failed:`, err);
      }
    }
  }

  getEnabledProviders(): string[] {
    return this.providers.filter(p => p.isEnabled()).map(p => p.name);
  }
}

export const multiplexer = new AnalyticsMultiplexer();
