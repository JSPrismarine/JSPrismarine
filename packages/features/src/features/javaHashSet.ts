import type { BlockPos } from '../world/FeatureWorld';

/** Java's `BlockPos.hashCode()`. */
export const blockPosHashCode = (position: BlockPos): number =>
    (Math.imul((position.y + Math.imul(position.z, 31)) | 0, 31) + position.x) | 0;

/** Java's `HashMap.hash`, which folds the high bits down so a weak hash still spreads. */
const spread = (hash: number): number => (hash ^ (hash >>> 16)) | 0;

/**
 * A `HashSet<BlockPos>` with Java's iteration order.
 *
 * A tree feature collects its logs, leaves and roots into `HashSet`s, and the decorators then
 * walk them. Java's iteration order is the table's bucket order, so which log gets the beehive
 * and which leaf grows a vine depend on `BlockPos.hashCode` and on how far the table has grown,
 * not on the order the tree placed them. A `Set` in insertion order would produce a different,
 * equally valid, but visibly different tree.
 *
 * Only insertion, membership and iteration are implemented, which is all the tree code uses.
 * The bucket order is derived at iteration time from the insertion log, which gives the same
 * answer as replaying Java's resizes: a resize rehashes every entry and keeps the relative order
 * inside each new bucket.
 */
export class JavaHashSet implements Iterable<BlockPos> {
    private capacity = 16;
    private threshold = 12;
    private readonly inserted: { readonly hash: number; readonly value: BlockPos }[] = [];
    private readonly seen = new Set<string>();

    /** How many positions the set holds. */
    public get size(): number {
        return this.inserted.length;
    }

    /** Adds a position, ignoring a repeat. */
    public add(position: BlockPos): void {
        const key = `${position.x},${position.y},${position.z}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.inserted.push({ hash: spread(blockPosHashCode(position)), value: position });
        if (this.inserted.length > this.threshold) {
            this.capacity *= 2;
            this.threshold = Math.trunc(this.capacity * 0.75);
        }
    }

    /** Answers whether a position is in the set. */
    public has(position: BlockPos): boolean {
        return this.seen.has(`${position.x},${position.y},${position.z}`);
    }

    /** Iterates in Java's bucket order: table slot ascending, insertion order inside a slot. */
    public *[Symbol.iterator](): Generator<BlockPos> {
        const buckets: BlockPos[][] = Array.from({ length: this.capacity }, () => []);
        for (const entry of this.inserted) buckets[entry.hash & (this.capacity - 1)]?.push(entry.value);
        for (const slot of buckets) yield* slot;
    }

    /** Returns the contents as an array in Java's iteration order. */
    public toArray(): BlockPos[] {
        return [...this];
    }

    /** Returns the contents sorted by y, stably, which is what a tree decorator reads. */
    public sortedByY(): BlockPos[] {
        return this.toArray().sort((a, b) => a.y - b.y);
    }
}
