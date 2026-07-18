export interface IAccountSetupResult {
  success: true;
  setupStatus: 'complete';
}
const MAX_SETUP_ATTEMPTS = 3;

export async function completeAccountSetup(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<IAccountSetupResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_SETUP_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl('/api/users/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Account setup returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as Partial<IAccountSetupResult>;
      if (result.success !== true || result.setupStatus !== 'complete') {
        throw new Error('Account setup did not return a terminal decision');
      }

      return result as IAccountSetupResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Account setup failed');
    }
  }

  throw lastError ?? new Error('Account setup failed');
}
