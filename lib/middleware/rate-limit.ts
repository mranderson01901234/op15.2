/**
 * Simple in-memory rate limiter
 * For production, upgrade to @upstash/ratelimit with Redis
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(key);
      }
    }
  }

  async check(key: string, config: RateLimitConfig): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> {
    const now = Date.now();
    const record = this.store.get(key);

    // If no record or window expired, create new record
    if (!record || now >= record.resetTime) {
      const newRecord: RateLimitRecord = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      this.store.set(key, newRecord);

      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        reset: newRecord.resetTime,
      };
    }

    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: record.resetTime,
      };
    }

    // Increment counter
    record.count++;
    this.store.set(key, record);

    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - record.count,
      reset: record.resetTime,
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton instance
const rateLimiter = new InMemoryRateLimiter();

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Chat API - most expensive (Gemini API calls)
  chat: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  // File operations - moderate usage
  filesystem: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
  // Image generation - expensive
  imagen: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 images per hour
  },
  // Command execution - security sensitive
  exec: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 commands per minute
  },
  // Global limit (per IP) - prevent abuse
  global: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 1000, // 1000 requests per hour
  },
} as const;

/**
 * Check rate limit for a user/IP
 * @param identifier - User ID or IP address
 * @param limitType - Type of rate limit to apply
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  limitType: keyof typeof RATE_LIMITS
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${identifier}`;

  return rateLimiter.check(key, config);
}

/**
 * Get the real IP address from request headers
 * Handles proxies and load balancers
 */
export function getClientIp(headers: Headers): string {
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a placeholder (in serverless, real IP might not be available)
  return 'unknown';
}

/**
 * Format retry-after time in seconds
 */
export function getRetryAfterSeconds(resetTime: number): number {
  const now = Date.now();
  const diff = resetTime - now;
  return Math.ceil(diff / 1000);
}

/**
 * Clean up rate limiter on process exit
 */
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    rateLimiter.destroy();
  });
}
