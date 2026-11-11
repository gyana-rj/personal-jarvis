/** Minimal push-to-pull bridge: callbacks push values, an async iterator pulls them. */
export function channel<T>() {
  const queue: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let failure: unknown;
  const notify = () => { wake?.(); wake = undefined; };
  return {
    push(v: T) { queue.push(v); notify(); },
    close() { closed = true; notify(); },
    fail(err: unknown) { failure = err ?? new Error('failed'); closed = true; notify(); },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      for (;;) {
        if (queue.length) { yield queue.shift()!; continue; }
        if (failure) throw failure;
        if (closed) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
}
