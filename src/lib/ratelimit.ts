import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const perUser = redis && new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'rl:login:user' });
const perIp = redis && new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '15 m'), prefix: 'rl:login:ip' });

/** Brute-force protection for sign-in. No Redis configured (or Redis down) => allowed. */
export async function limitLogin(ip: string, username: string): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (!perUser || !perIp) return { ok: true, retryAfterSec: 0 };
  try {
    const [u, i] = await Promise.all([perUser.limit(`${ip}:${username}`), perIp.limit(ip)]);
    if (u.success && i.success) return { ok: true, retryAfterSec: 0 };
    const reset = Math.max(u.success ? 0 : u.reset, i.success ? 0 : i.reset);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch (e) {
    console.error('[ratelimit] Redis unavailable, allowing request', e);
    return { ok: true, retryAfterSec: 0 };
  }
}
