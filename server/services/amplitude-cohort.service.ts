import { serverEnv } from '@shared/config/env';

export interface IAmplitudeCohort {
  id: string;
  name?: string;
  size?: number;
  syncMetadata?: unknown[];
}

export interface IAmplitudeCohortMember {
  userId?: string;
  amplitudeId?: string;
  email?: string;
  raw: Record<string, unknown>;
}

interface IAmplitudeCohortServiceOptions {
  apiKey?: string;
  secretKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export class AmplitudeCohortService {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(options: IAmplitudeCohortServiceOptions = {}) {
    this.apiKey = options.apiKey ?? serverEnv.AMPLITUDE_API_KEY;
    this.secretKey = options.secretKey ?? serverEnv.AMPLITUDE_SECRET_KEY;
    this.baseUrl = options.baseUrl ?? 'https://amplitude.com';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.maxPollAttempts = options.maxPollAttempts ?? 30;
  }

  async listCohorts(options?: { includeSyncInfo?: boolean }): Promise<IAmplitudeCohort[]> {
    const url = new URL('/api/3/cohorts', this.baseUrl);
    if (options?.includeSyncInfo) url.searchParams.set('includeSyncInfo', 'true');
    const response = await this.request(url);
    const body = (await response.json()) as { cohorts?: IAmplitudeCohort[] };
    return body.cohorts ?? [];
  }

  async downloadCohortMembers(cohortId: string): Promise<IAmplitudeCohortMember[]> {
    const requestId = await this.requestCohortDownload(cohortId);
    await this.pollUntilComplete(requestId);
    const download = await this.request(
      new URL(`/api/5/cohorts/request/${requestId}/file`, this.baseUrl)
    );
    const text = await download.text();
    return this.parseMembers(text, download.headers.get('content-type') ?? '');
  }

  private async requestCohortDownload(cohortId: string): Promise<string> {
    const url = new URL(`/api/5/cohorts/request/${cohortId}`, this.baseUrl);
    url.searchParams.set('props', '1');
    url.searchParams.append('propKeys', 'email');
    const response = await this.request(url);
    const body = (await response.json()) as { request_id?: string };
    if (!body.request_id) throw new Error('Amplitude cohort request did not return request_id');
    return body.request_id;
  }

  private async pollUntilComplete(requestId: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const response = await this.request(
        new URL(`/api/5/cohorts/request-status/${requestId}`, this.baseUrl),
        { allowAccepted: true }
      );
      const body = (await response.json()) as { async_status?: string };
      if (body.async_status === 'JOB COMPLETED') return;
      if (attempt < this.maxPollAttempts - 1) await this.sleep(this.pollIntervalMs);
    }
    throw new Error('Amplitude cohort download timed out');
  }

  private async request(url: URL, options?: { allowAccepted?: boolean }): Promise<Response> {
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Amplitude cohort API requires AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY');
    }

    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.secretKey}`).toString(
          'base64'
        )}`,
      },
      redirect: 'follow',
    });
    if (response.ok || (options?.allowAccepted && response.status === 202)) return response;

    const message = await response.text().catch(() => '');
    throw new Error(`Amplitude cohort API failed (${response.status}): ${message}`);
  }

  private parseMembers(body: string, contentType: string): IAmplitudeCohortMember[] {
    const trimmed = body.trim();
    if (!trimmed) return [];
    if (contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseJsonMembers(JSON.parse(trimmed));
    }
    return this.parseCsvMembers(trimmed);
  }

  private parseJsonMembers(body: unknown): IAmplitudeCohortMember[] {
    const rows = Array.isArray(body)
      ? body
      : Array.isArray((body as { users?: unknown[] }).users)
        ? (body as { users: unknown[] }).users
        : Array.isArray((body as { members?: unknown[] }).members)
          ? (body as { members: unknown[] }).members
          : [];
    return rows
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map(row => this.normalizeMember(row))
      .filter(member => member.userId || member.email || member.amplitudeId);
  }

  private parseCsvMembers(body: string): IAmplitudeCohortMember[] {
    const [headerLine, ...lines] = body.split(/\r?\n/).filter(Boolean);
    const headers = this.parseCsvLine(headerLine).map(header => header.trim());
    return lines
      .map(line => {
        const values = this.parseCsvLine(line);
        const row = Object.fromEntries(
          headers.map((header, index) => [header, values[index] ?? ''])
        );
        return this.normalizeMember(row);
      })
      .filter(member => member.userId || member.email || member.amplitudeId);
  }

  private normalizeMember(row: Record<string, unknown>): IAmplitudeCohortMember {
    const userId = this.firstString(row, ['user_id', 'userId', 'User ID', 'User ID (Amplitude)']);
    const amplitudeId = this.firstString(row, ['amplitude_id', 'amplitudeId', 'Amplitude ID']);
    const email = this.firstString(row, ['email', 'Email', '$email']);
    return { userId, amplitudeId, email: email?.toLowerCase(), raw: row };
  }

  private firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function getAmplitudeCohortService(): AmplitudeCohortService {
  return new AmplitudeCohortService();
}
