import type { IStripeEventMock } from './stripe-webhook-mocks';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Webhook sequencer for testing webhook event ordering and race conditions
 *
 * This utility allows firing webhook events in configurable order against
 * the actual webhook route handler, enabling tests for:
 * - Event ordering dependencies
 * - Race condition handling
 * - Duplicate event processing
 * - Out-of-order delivery scenarios
 */

export type WebhookEventGenerator = () => IStripeEventMock | Promise<IStripeEventMock>;

export interface ISequencerResult {
  eventType: string;
  eventId: string;
  status: number;
  response: any;
  error?: Error;
}

export interface ISequencerOptions {
  delay?: number; // Delay between events in ms
  concurrent?: boolean; // Fire events concurrently (for race condition testing)
  stopOnError?: boolean; // Stop sequencing if an event fails
}

/**
 * Sequencer for firing webhook events in configurable order
 *
 * The sequencer executes webhook event generators and records the results,
 * enabling verification that events are processed correctly in various orders.
 *
 * @example
 * ```typescript
 * const sequencer = new WebhookSequencer(supabase, getMockHandler);
 *
 * const results = await sequencer.sequence([
 *   () => createCheckoutSessionCompleted({ userId: 'user1' }),
 *   () => createSubscriptionCreated({ userId: 'user1' }),
 *   () => createInvoicePaymentSucceeded({ userId: 'user1' }),
 * ], { delay: 100 });
 *
 * expect(results).toHaveLength(3);
 * expect(results[0].status).toBe(200);
 * ```
 */
export class WebhookSequencer {
  constructor(
    private supabase: SupabaseClient,
    private getHandler: (eventType: string) => any
  ) {}

  /**
   * Fire events in the configured order and return all responses
   *
   * @param eventGenerators - Array of functions that generate webhook events
   * @param options - Sequencer options (delay, concurrent mode, error handling)
   * @returns Array of sequencer results with status and response data
   */
  async sequence(
    eventGenerators: WebhookEventGenerator[],
    options: ISequencerOptions = {}
  ): Promise<ISequencerResult[]> {
    const { delay = 0, concurrent = false, stopOnError = true } = options;

    if (concurrent) {
      return this.sequenceConcurrent(eventGenerators, stopOnError);
    } else {
      return this.sequenceSequential(eventGenerators, delay, stopOnError);
    }
  }

  /**
   * Fire events sequentially with optional delays
   */
  private async sequenceSequential(
    eventGenerators: WebhookEventGenerator[],
    delay: number,
    stopOnError: boolean
  ): Promise<ISequencerResult[]> {
    const results: ISequencerResult[] = [];

    for (const generator of eventGenerators) {
      const result = await this.executeEvent(generator);

      results.push(result);

      // Stop if error occurred and stopOnError is true
      if (result.error && stopOnError) {
        break;
      }

      // Add delay if specified
      if (delay > 0 && generator !== eventGenerators[eventGenerators.length - 1]) {
        await this.sleep(delay);
      }
    }

    return results;
  }

  /**
   * Fire events concurrently (for race condition testing)
   */
  private async sequenceConcurrent(
    eventGenerators: WebhookEventGenerator[],
    stopOnError: boolean
  ): Promise<ISequencerResult[]> {
    const promises = eventGenerators.map(generator => this.executeEvent(generator));

    if (stopOnError) {
      // Wait for all but return results (errors are captured in individual results)
      return await Promise.all(promises);
    } else {
      // Settled mode - wait for all regardless of failures
      return await Promise.all(promises);
    }
  }

  /**
   * Execute a single event and capture the result
   */
  private async executeEvent(generator: WebhookEventGenerator): Promise<ISequencerResult> {
    try {
      const event = await generator();
      const eventType = event.type;
      const eventId = event.id;

      // Get the handler for this event type
      const handler = this.getHandler(eventType);

      if (!handler) {
        return {
          eventType,
          eventId,
          status: 404,
          response: null,
          error: new Error(`No handler found for event type: ${eventType}`),
        };
      }

      // Execute the handler (in tests, this would be a mock or real webhook handler)
      const response = await handler(event);

      return {
        eventType,
        eventId,
        status: response.status || 200,
        response,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        eventType: 'unknown',
        eventId: 'unknown',
        status: 500,
        response: null,
        error: err,
      };
    }
  }

  /**
   * Sleep utility for delays between events
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Verify all events succeeded
   *
   * @param results - Sequencer results to check
   * @throws Error if any events failed
   */
  static assertAllSuccess(results: ISequencerResult[]): void {
    const failures = results.filter(r => r.error || r.status >= 400);

    if (failures.length > 0) {
      const failureDetails = failures
        .map(
          f =>
            `  - ${f.eventType} (${f.eventId}): status=${f.status}${f.error ? `, error="${f.error.message}"` : ''}`
        )
        .join('\n');

      throw new Error(
        `${failures.length} webhook event(s) failed:\n${failureDetails}\n\nAll events must succeed for test to pass.`
      );
    }
  }

  /**
   * Verify events executed in order (by created timestamp)
   *
   * @param results - Sequencer results to check
   * @throws Error if events are not in chronological order
   */
  static assertOrdered(results: ISequencerResult[]): void {
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];

      // Extract timestamps from event IDs (Stripe IDs contain timestamp)
      const prevTimestamp = this.extractTimestampFromEventId(prev.eventId);
      const currTimestamp = this.extractTimestampFromEventId(curr.eventId);

      if (prevTimestamp && currTimestamp && currTimestamp < prevTimestamp) {
        throw new Error(
          `Events not in chronological order: ${prev.eventId} (${prevTimestamp}) > ${curr.eventId} (${currTimestamp})`
        );
      }
    }
  }

  /**
   * Extract Unix timestamp from Stripe event ID
   *
   * Stripe event IDs are formatted like: evt_1xyz123... where the timestamp
   * is embedded in the ID. This is a simplified extraction.
   */
  private static extractTimestampFromEventId(eventId: string): number | null {
    // Stripe event IDs contain a timestamp prefix
    // Format: evt_1XXXXXXXXXXX...
    // We'll use a simple regex to extract the numeric portion
    const match = eventId.match(/evt_1(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
}
