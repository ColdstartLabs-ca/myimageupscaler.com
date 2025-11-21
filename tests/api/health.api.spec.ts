import { test, expect } from '@playwright/test';

test.describe('API: Health Check', () => {
  test('should return 200 OK with status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('region');

    // Validate ISO 8601 timestamp
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  test('should return correct region header', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();

    // Local dev should return 'Local'
    expect(data.region).toBe('Local');
  });

  test('should have correct content-type header', async ({ request }) => {
    const response = await request.get('/api/health');
    const contentType = response.headers()['content-type'];

    expect(contentType).toContain('application/json');
  });

  test('should respond quickly', async ({ request }) => {
    const startTime = Date.now();
    await request.get('/api/health');
    const duration = Date.now() - startTime;

    // Health check should respond in less than 3 seconds (allows for cold starts in dev)
    expect(duration).toBeLessThan(3000);
  });
});
