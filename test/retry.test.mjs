import { describe, it, expect, vi } from 'vitest';
import { withRateLimitRetry } from '../bridge/llm/retry.ts';
import { RateLimitError } from '../bridge/llm/types.ts';

const err429 = () => Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });

describe('withRateLimitRetry', () => {
  it('retries 429s with exponential backoff, then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const out = await withRateLimitRetry(async () => { if (++n < 3) throw err429(); return 'ok'; }, { sleep, baseMs: 1000 });
    expect(out).toBe('ok');
    expect(n).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('gives up after 3 retries with a RateLimitError', async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    await expect(withRateLimitRetry(async () => { n++; throw err429(); }, { sleep })).rejects.toBeInstanceOf(RateLimitError);
    expect(n).toBe(4); // first try + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const sleep = vi.fn(async () => {});
    await expect(withRateLimitRetry(async () => { throw Object.assign(new Error('bad'), { status: 400 }); }, { sleep })).rejects.toThrow('bad');
    expect(sleep).not.toHaveBeenCalled();
  });
});
