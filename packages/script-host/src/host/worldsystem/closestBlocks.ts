/**
 * `Dimension.getBlocks` with `closest`: which blocks of a volume BDS picks as the nearest few to
 * a location, ties included.
 *
 * Captured on the pinned 1.26.60.6 server in the `dimension-volumes` scenario (#3317): BDS
 * measures to each block's minimum corner, walks the volume x, then z, then y, each upward, and
 * keeps the nearest in a max-heap of the size asked for, which a later block enters only when it
 * is strictly nearer than the farthest kept, by `std::priority_queue`'s `pop` then `push`. Of two
 * blocks at one distance, which one survives therefore depends on where each sat in the heap,
 * and a plain sort by distance picks differently. This reproduces 29 of the 32 captured picks.
 */
import type { ScriptVector3 } from '../world';

interface Entry {
    readonly block: ScriptVector3;
    readonly distance: number;
}

/** libc++'s `__sift_up` over the first `end` entries of a max-heap by distance. */
const siftUp = (heap: Entry[], end = heap.length): void => {
    let length = end;
    if (length < 2) return;
    let last = length - 1;
    length = (length - 2) >> 1;
    let parent = length;
    const moved = heap[last];
    if (moved === undefined || !((heap[parent]?.distance ?? 0) < moved.distance)) return;
    for (;;) {
        heap[last] = heap[parent] as Entry;
        last = parent;
        if (length === 0) break;
        length = (length - 1) >> 1;
        parent = length;
        if (!((heap[parent]?.distance ?? 0) < moved.distance)) break;
    }
    heap[last] = moved;
};

/** libc++'s `pop_heap` by Floyd's sift-down, then the pop itself. */
const pop = (heap: Entry[]): void => {
    const length = heap.length;
    if (length > 1) {
        const top = heap[0] as Entry;
        let hole = 0;
        let child = 0;
        for (;;) {
            child = 2 * child + 1;
            if (child + 1 < length && (heap[child]?.distance ?? 0) < (heap[child + 1]?.distance ?? 0)) child += 1;
            heap[hole] = heap[child] as Entry;
            hole = child;
            if (child > (length - 2) >> 1) break;
        }
        const last = length - 1;
        if (hole === last) heap[hole] = top;
        else {
            heap[hole] = heap[last] as Entry;
            heap[last] = top;
            siftUp(heap, hole + 1);
        }
    }
    heap.pop();
};

/**
 * The `count` blocks nearest a location, as BDS picks them, nearest first.
 * @param blocks - The blocks that passed the query's filter.
 */
export const closestBlocks = (
    blocks: readonly ScriptVector3[],
    location: ScriptVector3,
    count: number
): ScriptVector3[] => {
    const walk = [...blocks].sort((one, two) => one.x - two.x || one.z - two.z || one.y - two.y);
    const heap: Entry[] = [];
    for (const block of walk) {
        const distance = (block.x - location.x) ** 2 + (block.y - location.y) ** 2 + (block.z - location.z) ** 2;
        if (heap.length < count) {
            heap.push({ block, distance });
            siftUp(heap);
        } else if (count > 0 && distance < (heap[0]?.distance ?? Infinity)) {
            pop(heap);
            heap.push({ block, distance });
            siftUp(heap);
        }
    }
    return heap.sort((one, two) => one.distance - two.distance).map((entry) => entry.block);
};
