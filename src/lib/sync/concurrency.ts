export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let firstError: unknown;
  let failed = false;
  let stopped = false;

  const runWorker = async () => {
    while (!stopped && nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(values[index], index);
      } catch (error) {
        if (!failed) {
          firstError = error;
          failed = true;
        }
        stopped = true;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => runWorker(),
    ),
  );

  if (failed) {
    throw firstError;
  }

  return results;
}
