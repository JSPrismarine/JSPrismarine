/**
 * Merges iterators that are each already sorted into one sorted stream.
 *
 * On a tie the earlier source wins, so a caller that lists its sources newest first gets the
 * newest of two equal entries first.
 *
 * @param sources - Iterators sorted by `compare`.
 * @param compare - The order every source is sorted in.
 */
export function* mergeSorted<T>(sources: Array<Iterator<T>>, compare: (a: T, b: T) => number): IterableIterator<T> {
    const heads = sources.map((source) => source.next());

    for (;;) {
        let best = -1;
        let bestHead: IteratorYieldResult<T> | null = null;
        for (let i = 0; i < heads.length; i++) {
            const head = heads[i]!;
            if (head.done) continue;
            if (bestHead === null || compare(head.value, bestHead.value) < 0) {
                best = i;
                bestHead = head;
            }
        }

        if (bestHead === null) return;

        yield bestHead.value;
        heads[best] = sources[best]!.next();
    }
}
