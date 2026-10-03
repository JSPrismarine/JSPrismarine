import {
    ValueType,
    compareInternalKeys,
    encodeInternalKey,
    extractUserKey,
    parseInternalKey
} from '../format/InternalKey';
import { compareBytewise } from '../util/Comparator';

export interface MemTableEntry {
    internalKey: Buffer;
    /** Null for a deletion tombstone, which must shadow older values rather than being absent. */
    value: Buffer | null;
}

/**
 * The in-memory half of the database: everything written since the last flush.
 *
 * A sorted array with binary-search insertion, not the skiplist upstream uses. The write pattern
 * here is bursts of a few dozen keys per chunk against a table that flushes at a few megabytes, so
 * the memmove an array insert costs is bounded and the code is a fraction of the size. If a
 * profile ever says otherwise, this is the one class that would have to change.
 */
export class MemTable {
    private readonly entries: MemTableEntry[] = [];
    private bytes = 0;

    public get size(): number {
        return this.bytes;
    }

    public get count(): number {
        return this.entries.length;
    }

    public get empty(): boolean {
        return this.entries.length === 0;
    }

    /** The index of the first entry at or after `internalKey`. */
    private lowerBound(internalKey: Buffer): number {
        let low = 0;
        let high = this.entries.length;

        while (low < high) {
            const middle = (low + high) >>> 1;
            if (compareInternalKeys(this.entries[middle]!.internalKey, internalKey) < 0) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        return low;
    }

    public add(userKey: Buffer, sequence: bigint, type: ValueType, value: Buffer | null): void {
        const internalKey = encodeInternalKey(userKey, sequence, type);
        const at = this.lowerBound(internalKey);

        this.entries.splice(at, 0, { internalKey, value });
        this.bytes += internalKey.byteLength + (value?.byteLength ?? 0) + 24;
    }

    /**
     * The newest entry for `userKey`, or undefined when this memtable has never seen it.
     *
     * A tombstone comes back as `{ found: true, value: null }` and must not be mistaken for a
     * miss: it is what stops an older table's value from being returned.
     */
    public get(userKey: Buffer): { found: boolean; value: Buffer | null } {
        // Sequence and type are irrelevant to where the search lands, because for one user key the
        // trailers sort descending - so the first entry at or after "this key, newest possible" is
        // the newest version of it.
        const at = this.lowerBound(encodeInternalKey(userKey, (1n << 56n) - 1n, ValueType.Value));
        const entry = this.entries[at];

        if (entry === undefined || compareBytewise(extractUserKey(entry.internalKey), userKey) !== 0) {
            return { found: false, value: null };
        }

        return { found: true, value: entry.value };
    }

    /** Every entry, oldest user key first and newest version of each first. */
    public *iterate(): IterableIterator<MemTableEntry> {
        yield* this.entries;
    }

    /** The smallest and largest internal key held, which a flushed table records as its range. */
    public bounds(): { smallest: Buffer; largest: Buffer } | null {
        if (this.entries.length === 0) return null;

        return { smallest: this.entries[0]!.internalKey, largest: this.entries.at(-1)!.internalKey };
    }

    /** The highest sequence number in the table, for restoring `lastSequence` after a replay. */
    public maxSequence(): bigint {
        let max = 0n;
        for (const entry of this.entries) {
            const { sequence } = parseInternalKey(entry.internalKey);
            if (sequence > max) max = sequence;
        }

        return max;
    }
}

export default MemTable;
