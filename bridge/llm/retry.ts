import { RateLimitError } from './types';

export const isRateLimit = (err: unknown): boolean => {
  const e = err as { status?: number; code?: number; message?: string } | null;
  return e?.status === 429 || e?.code === 429 || /RESOURCE_EXHAUSTED/.test(e?.message ?? '');
};

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Runs `fn`, retrying on HTTP 429 with exponential backoff (1s, 2s, 4s by default).
 * After the last retry a RateLimitError is thrown so the caller can say something in character.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseMs = 1000, signal, sleep = defaultSleep } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimit(err)) throw err;
      if (attempt >= retries) throw new RateLimitError('rate limited after retries');
      await sleep(baseMs * 2 ** attempt, signal);
    }
  }
}
