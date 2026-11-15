import { compareBytewise } from '../util/Comparator';
import { ValueType, extractUserKey, parseInternalKey } from '../format/InternalKey';
import { TableBuilder } from '../format/TableBuilder';
import type { BlockEntry } from '../format/BlockReader';
import type { TableBuilderOptions } from '../format/TableBuilder';

/** One table a compaction produced, ready to be written under a fresh file number. */
export interface CompactionTable {
    bytes: Buffer;
    /** The first internal key in the table. */
    smallest: Buffer;
    /** The last internal key in the table. */
    largest: Buffer;
}

/** How {@link compactEntries} shapes its output. */
export interface CompactionOptions {
    /** No table is longer than this, unless a single entry is. */
    maxFileSize: number;
    /** Options every output table is built with. */
    table: TableBuilderOptions;
    /**
     * Whether a level below the output can still hold an older version of `userKey`. A deletion
     * is kept while one can, so the older value stays hidden.
     */
    hasOlderFile: (userKey: Buffer) => boolean;
}

/**
 * Turns a merged stream of internal keys into the tables a compaction writes.
 *
 * Keeps only the newest version of each user key, which is all a database without snapshots can
 * read, and drops a deletion once nothing deeper can hold what it deletes. Since each user key
 * keeps one version, no user key is ever split across two output tables.
 *
 * A table is cut before the entry that could take it past `maxFileSize`, judged by the
 * builder's upper bound on its finished size, so every table is built exactly once.
 *
 * @param merged - Entries sorted by internal key, newest version of each user key first.
 * @param options - The size cap, table options and deeper-level check.
 */
export function* compactEntries(
    merged: Iterable<BlockEntry>,
    options: CompactionOptions
): IterableIterator<CompactionTable> {
    let builder: TableBuilder | null = null;
    let smallest: Buffer | null = null;
    let largest: Buffer | null = null;
    let previousUserKey: Buffer | null = null;

    for (const entry of merged) {
        const userKey = extractUserKey(entry.key);
        if (previousUserKey !== null && compareBytewise(previousUserKey, userKey) === 0) continue;
        previousUserKey = Buffer.from(userKey);

        if (parseInternalKey(entry.key).type === ValueType.Deletion && !options.hasOlderFile(userKey)) continue;

        if (builder !== null && builder.maxFinishedSizeWith(entry.key, entry.value) > options.maxFileSize) {
            yield { bytes: builder.finish(), smallest: smallest!, largest: largest! };
            builder = null;
        }

        if (builder === null) {
            builder = new TableBuilder(options.table);
            smallest = Buffer.from(entry.key);
        }

        builder.add(entry.key, entry.value);
        largest = Buffer.from(entry.key);
    }

    if (builder !== null) yield { bytes: builder.finish(), smallest: smallest!, largest: largest! };
}
