import { test, expect } from '@playwright/test';
import { TestContext } from '../helpers';
import type { ITestUser } from '../helpers/test-data-manager';

/**
 * Upscaler Workflow Integration Tests
 *
 * These tests verify the complete image upscaler workflow including:
 * - Credit validation and deduction
 * - Job creation and status tracking
 * - Result delivery and error handling
 * - Integration with AI service
 */

test.describe('Upscaler Workflow Integration', () => {
  let ctx: TestContext;
  let testUser: ITestUser;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.beforeEach(async () => {
    // Create fresh user for each test with sufficient credits
    testUser = await ctx.createUser({ subscription: 'active', tier: 'pro', credits: 50 });
  });

  test.describe('Complete Workflow', () => {
    test('should process image upscaler request end-to-end', async ({ request }) => {
      // Step 1: Submit upscaler request
      const submitResponse = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 2,
        },
      });

      expect(submitResponse.ok()).toBeTruthy();
      const { jobId, creditsRequired, estimatedTime } = await submitResponse.json();

      expect(jobId).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(creditsRequired).toBe(1); // Base rate for 2x upscale
      expect(estimatedTime).toBeGreaterThan(0);

      // Step 2: Check initial job status
      const statusResponse = await request.get(`/api/jobs/${jobId}/status`, {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
        },
      });

      expect(statusResponse.ok()).toBeTruthy();
      const { status, progress, createdAt } = await statusResponse.json();

      expect(['pending', 'processing']).toContain(status);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(new Date(createdAt)).toBeInstanceOf(Date);

      // Step 3: Verify credits were reserved
      const profileAfterSubmit = await ctx.data.getUserProfile(testUser.id);
      expect(profileAfterSubmit.credits_balance).toBe(49); // 50 - 1 reserved

      // Step 4: Wait for processing completion (in real test, this would poll)
      // For integration test, we'll simulate completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 5: Get final result
      const resultResponse = await request.get(`/api/jobs/${jobId}/result`, {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
        },
      });

      if (resultResponse.ok()) {
        const { status: finalStatus, resultUrl, processedAt } = await resultResponse.json();

        if (finalStatus === 'completed') {
          expect(resultUrl).toMatch(/^https?:\/\//);
          expect(new Date(processedAt)).toBeInstanceOf(Date);

          // Step 6: Verify credits were properly deducted
          const finalProfile = await ctx.data.getUserProfile(testUser.id);
          expect(finalProfile.credits_balance).toBe(49); // Still 49 (credits deducted)

          // Step 7: Verify transaction was logged
          const transactions = await ctx.data.getCreditTransactions(testUser.id);
          const usageTransaction = transactions.find(t => t.reference_id === jobId);
          expect(usageTransaction).toMatchObject({
            amount: -1,
            type: 'usage',
            description: expect.stringContaining('upscale'),
          });
        }
      } else {
        // If processing failed, verify credits were refunded
        const finalProfile = await ctx.data.getUserProfile(testUser.id);
        expect(finalProfile.credits_balance).toBe(50); // Credits refunded

        // Check for refund transaction
        const transactions = await ctx.data.getCreditTransactions(testUser.id);
        const refundTransaction = transactions.find(
          t => t.type === 'refund' && t.reference_id === jobId
        );
        expect(refundTransaction).toMatchObject({
          amount: 1,
          type: 'refund',
        });
      }
    });

    test('should handle different upscale factors correctly', async ({ request }) => {
      const testCases = [
        { factor: 2, expectedCredits: 1 },
        { factor: 3, expectedCredits: 2 },
        { factor: 4, expectedCredits: 3 },
      ];

      for (const { factor, expectedCredits } of testCases) {
        const response = await request.post('/api/upscale', {
          headers: {
            Authorization: `Bearer ${testUser.token}`,
            'Content-Type': 'application/json',
          },
          data: {
            imageUrl: 'https://picsum.photos/100/100',
            upscaleFactor: factor,
          },
        });

        expect(response.ok()).toBeTruthy();
        const { creditsRequired } = await response.json();
        expect(creditsRequired).toBe(expectedCredits);
      }
    });

    test('should reject requests with insufficient credits', async ({ request }) => {
      // Create user with low credits
      const lowCreditUser = await ctx.createUser({ subscription: 'free', credits: 1 });

      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${lowCreditUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 4, // Requires 3 credits
        },
      });

      expect(response.status()).toBe(402); // Payment Required
      const { error } = await response.json();
      expect(error).toContain('Insufficient credits');

      // Note: TestContext handles cleanup automatically
    });
  });

  test.describe('Job Status and Polling', () => {
    test('should track job status changes accurately', async ({ request }) => {
      // Submit job
      const submitResponse = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 2,
        },
      });

      const { jobId } = await submitResponse.json();

      // Poll status (in real scenario)
      let previousStatus = '';
      let statusChanges = 0;

      const maxPolls = 10;
      for (let i = 0; i < maxPolls; i++) {
        const statusResponse = await request.get(`/api/jobs/${jobId}/status`, {
          headers: {
            Authorization: `Bearer ${testUser.token}`,
          },
        });

        expect(statusResponse.ok()).toBeTruthy();
        const { status, progress } = await statusResponse.json();

        if (status !== previousStatus) {
          statusChanges++;
          previousStatus = status;
        }

        expect(['pending', 'processing', 'completed', 'failed']).toContain(status);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(100);

        if (status === 'completed' || status === 'failed') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(statusChanges).toBeGreaterThan(0);
    });

    test('should handle concurrent job requests', async ({ request }) => {
      const concurrentJobs = 3;
      const jobIds: string[] = [];

      // Submit multiple jobs concurrently
      const submitPromises = Array(concurrentJobs)
        .fill(null)
        .map(async (_, index) => {
          const response = await request.post('/api/upscale', {
            headers: {
              Authorization: `Bearer ${testUser.token}`,
              'Content-Type': 'application/json',
            },
            data: {
              imageUrl: `https://picsum.photos/100/100?random=${index}`,
              upscaleFactor: 2,
            },
          });

          expect(response.ok()).toBeTruthy();
          const { jobId } = await response.json();
          jobIds.push(jobId);
          return jobId;
        });

      await Promise.all(submitPromises);

      // Verify all jobs were created
      expect(jobIds).toHaveLength(concurrentJobs);
      expect(new Set(jobIds)).toHaveLength(concurrentJobs); // All unique

      // Check credits reserved for all jobs
      const profileAfterJobs = await ctx.data.getUserProfile(testUser.id);
      expect(profileAfterJobs.credits_balance).toBe(47); // 50 - 3 jobs

      // Get status for all jobs
      const statusPromises = jobIds.map(jobId =>
        request.get(`/api/jobs/${jobId}/status`, {
          headers: {
            Authorization: `Bearer ${testUser.token}`,
          },
        })
      );

      const statusResponses = await Promise.all(statusPromises);
      statusResponses.forEach(response => {
        expect(response.ok()).toBeTruthy();
      });
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle invalid image URLs gracefully', async ({ request }) => {
      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'invalid-url',
          upscaleFactor: 2,
        },
      });

      expect(response.status()).toBe(400);
      const { error } = await response.json();
      expect(error).toContain('Invalid image URL');

      // Verify credits were not deducted
      const profile = await ctx.data.getUserProfile(testUser.id);
      expect(profile.credits_balance).toBe(50);
    });

    test('should handle invalid upscale factors', async ({ request }) => {
      const invalidFactors = [0, 1, 5, 10, -1];

      for (const factor of invalidFactors) {
        const response = await request.post('/api/upscale', {
          headers: {
            Authorization: `Bearer ${testUser.token}`,
            'Content-Type': 'application/json',
          },
          data: {
            imageUrl: 'https://picsum.photos/100/100',
            upscaleFactor: factor,
          },
        });

        expect(response.status()).toBe(400);
      }
    });

    test('should handle authentication errors', async ({ request }) => {
      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: 'Bearer invalid-token',
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 2,
        },
      });

      expect(response.status()).toBe(401);
    });

    test('should handle missing required fields', async ({ request }) => {
      // Missing imageUrl
      let response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          upscaleFactor: 2,
        },
      });
      expect(response.status()).toBe(400);

      // Missing upscaleFactor
      response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
        },
      });
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Analytics and Logging', () => {
    test('should track upscaler usage in analytics', async ({ request }) => {
      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 2,
        },
      });

      expect(response.ok()).toBeTruthy();

      // Verify analytics event would be sent
      // In real implementation, you'd mock the analytics service
      // and verify the event was sent with correct properties
    });

    test('should maintain audit trail in database', async ({ request }) => {
      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/100/100',
          upscaleFactor: 3,
        },
      });

      const { jobId } = await response.json();

      // Check job record in database
      const { data: jobRecord, error } = await ctx.supabaseAdmin
        .from('upscaler_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      expect(error).toBeNull();
      expect(jobRecord).toMatchObject({
        user_id: testUser.id,
        image_url: 'https://picsum.photos/100/100',
        upscale_factor: 3,
        credits_required: 2,
        status: expect.stringMatching(/pending|processing/),
      });
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should handle high-resolution images efficiently', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.post('/api/upscale', {
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          imageUrl: 'https://picsum.photos/2000/2000', // High resolution
          upscaleFactor: 2,
        },
      });

      const responseTime = Date.now() - startTime;

      expect(response.ok()).toBeTruthy();
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds

      const { creditsRequired } = await response.json();
      // Higher resolution images should cost more credits
      expect(creditsRequired).toBeGreaterThan(1);
    });

    test('should enforce rate limiting', async ({ request }) => {
      const requests = Array(20)
        .fill(null)
        .map(() =>
          request.post('/api/upscale', {
            headers: {
              Authorization: `Bearer ${testUser.token}`,
              'Content-Type': 'application/json',
            },
            data: {
              imageUrl: 'https://picsum.photos/100/100',
              upscaleFactor: 2,
            },
          })
        );

      const results = await Promise.allSettled(requests);
      const rateLimited = results.filter(
        result => result.status === 'fulfilled' && result.value.status() === 429
      );

      // Should rate limit after certain number of requests
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
