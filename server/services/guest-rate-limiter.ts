/**
 * Server-Side Guest Rate Limiting
 *
 * Multi-layer protection using Upstash Redis:
 * 1. Global daily cap (prevents runaway costs)
 * 2. IP hourly/daily limits (catches abuse patterns)
 * 3. Bot detection (fingerprint diversity per IP)
 *
 * All keys auto-expire - no persistent database storage.
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';
import { serverEnv } from '@shared/config/env';
import { GUEST_LIMITS } from '@shared/config/guest-limits.config';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: serverEnv.UPSTASH_REDIS_REST_URL,
      token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function hashIp(ip: string): string {
  const salt = serverEnv.IP_HASH_SALT || 'default-salt';
  return createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .slice(0, 16);
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

const KEYS = {
  globalDaily: () => `guest:global:${todayKey()}`,
  ipHourly: (ip: string) => `guest:ip:${hashIp(ip)}:hourly`,
  ipDaily: (ip: string) => `guest:ip:${hashIp(ip)}:daily`,
  ipFingerprints: (ip: string) => `guest:ip:${hashIp(ip)}:fps`,
};

export interface IGuestLimitCheck {
  allowed: boolean;
  reason?: string;
  errorCode?: 'GLOBAL_LIMIT' | 'IP_LIMIT' | 'BOT_DETECTED';
}

/**
 * Check if a guest request is allowed under all rate limits
 */
export async function checkGuestLimits(ip: string, fingerprint: string): Promise<IGuestLimitCheck> {
  const redis = getRedis();

  // Layer 1: Global circuit breaker (MOST IMPORTANT)
  const globalCount = (await redis.get<number>(KEYS.globalDaily())) || 0;
  if (globalCount >= GUEST_LIMITS.GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'Service at capacity. Try again tomorrow or create a free account.',
      errorCode: 'GLOBAL_LIMIT',
    };
  }

  // Layer 2: IP hourly limit
  const ipHourly = (await redis.get<number>(KEYS.ipHourly(ip))) || 0;
  if (ipHourly >= GUEST_LIMITS.IP_HOURLY_LIMIT) {
    return {
      allowed: false,
      reason: 'Hourly limit reached. Sign up for unlimited access.',
      errorCode: 'IP_LIMIT',
    };
  }

  // Layer 3: IP daily limit
  const ipDaily = (await redis.get<number>(KEYS.ipDaily(ip))) || 0;
  if (ipDaily >= GUEST_LIMITS.IP_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'Daily limit reached from your network. Create a free account to continue.',
      errorCode: 'IP_LIMIT',
    };
  }

  // Layer 4: Bot detection (many fingerprints from same IP)
  const existingFingerprints = (await redis.smembers(KEYS.ipFingerprints(ip))) || [];
  if (
    existingFingerprints.length >= GUEST_LIMITS.FINGERPRINTS_PER_IP_LIMIT &&
    !existingFingerprints.includes(fingerprint)
  ) {
    return {
      allowed: false,
      reason: 'Suspicious activity detected.',
      errorCode: 'BOT_DETECTED',
    };
  }

  return { allowed: true };
}

/**
 * Increment all rate limit counters after successful processing
 */
export async function incrementGuestUsage(ip: string, fingerprint: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  // Global counter (24h TTL)
  pipeline.incr(KEYS.globalDaily());
  pipeline.expire(KEYS.globalDaily(), 86400);

  // IP hourly (1h TTL)
  pipeline.incr(KEYS.ipHourly(ip));
  pipeline.expire(KEYS.ipHourly(ip), 3600);

  // IP daily (24h TTL)
  pipeline.incr(KEYS.ipDaily(ip));
  pipeline.expire(KEYS.ipDaily(ip), 86400);

  // Fingerprint tracking for bot detection (1h TTL)
  pipeline.sadd(KEYS.ipFingerprints(ip), fingerprint);
  pipeline.expire(KEYS.ipFingerprints(ip), 3600);

  await pipeline.exec();
}

/**
 * Get global usage stats (for monitoring)
 */
export async function getGlobalUsage(): Promise<{ count: number; limit: number }> {
  const redis = getRedis();
  const count = (await redis.get<number>(KEYS.globalDaily())) || 0;
  return { count, limit: GUEST_LIMITS.GLOBAL_DAILY_LIMIT };
}
