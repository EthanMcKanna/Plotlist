// Bounded parallelism for fan-out over external APIs (TMDB, OMDb, Wikipedia)
// where a plain Promise.all would either blow past a provider's rate limit
// or the Worker's subrequest budget. Results keep input order; a rejected
// task rejects the whole map (wrap the task if a failure should be tolerated).

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) {
    return results;
  }
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}

// Probe candidates in order, a batch at a time, and return the first match
// by candidate order. Later batches only run when an earlier one had no hit,
// so a likely-first candidate still costs one batch rather than the whole
// list — the wiki page resolver's trade between latency and fetch budget.
export async function findFirstMatchInBatches<T, R>(
  candidates: readonly T[],
  batchSize: number,
  probe: (candidate: T) => Promise<R | null>,
): Promise<R | null> {
  const size = Math.max(1, Math.floor(batchSize));
  for (let offset = 0; offset < candidates.length; offset += size) {
    const batch = candidates.slice(offset, offset + size);
    const results = await Promise.all(batch.map((candidate) => probe(candidate)));
    const hit = results.find((result) => result !== null);
    if (hit !== undefined && hit !== null) {
      return hit;
    }
  }
  return null;
}
