/** Running a runner's suites a few at a time without letting two heavy ones overlap. */

/**
 * Runs `items` at most `concurrency` at a time, and never two exclusive items at once.
 *
 * Items start in their given order, except that while an exclusive item runs, a free worker takes
 * the next item that is not exclusive. A worker with only exclusive items left waits for the
 * running one to finish. Each noise-world server takes every chunk worker the runner can spare,
 * so two of them at once leave both clients on their loading screens until the join times out.
 *
 * @param items - The items, in the order they should start.
 * @param concurrency - How many items run at once.
 * @param exclusive - Whether an item must not run beside another exclusive one.
 * @param run - Runs one item; gets its index in `items`.
 * @returns Each item's result, at the item's index.
 */
export const runQueued = async <T, R>(
    items: readonly T[],
    concurrency: number,
    exclusive: (item: T) => boolean,
    run: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    const pending = items.map((item, index) => ({ item, index }));
    let exclusiveRunning: Promise<void> | undefined;
    const worker = async (): Promise<void> => {
        while (pending.length > 0) {
            const at = exclusiveRunning ? pending.findIndex(({ item }) => !exclusive(item)) : 0;
            if (at === -1) {
                await exclusiveRunning;
                continue;
            }
            const [next] = pending.splice(at, 1);
            if (next === undefined) return;
            const { item, index } = next;
            if (!exclusive(item)) {
                results[index] = await run(item, index);
                continue;
            }
            // Set before the first await, so a worker woken by the previous release sees it.
            let finished: () => void = () => {};
            exclusiveRunning = new Promise<void>((resolve) => {
                finished = resolve;
            });
            try {
                results[index] = await run(item, index);
            } finally {
                exclusiveRunning = undefined;
                finished();
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};
