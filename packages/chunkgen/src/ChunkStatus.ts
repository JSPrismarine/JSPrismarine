/**
 * The ten chunk statuses Java Edition 26.3 registers, in registration order.
 *
 * `ChunkStatus`'s static initializer in the 26.3 server jar registers exactly these names, and
 * each `register(name, parent, ...)` call sets `index = parent.index + 1`. The list is therefore a
 * chain rather than a graph, which is what lets {@link isOrAfter} be an integer comparison.
 *
 * 26.3 has ten statuses, not the twelve older versions had. `noise`, `surface` and `carvers` were
 * merged into one `terrain` status whose task runs noise fill, surface materials and carvers back
 * to back.
 */
export const CHUNK_STATUSES = [
    'empty',
    'structure_starts',
    'structure_references',
    'biomes',
    'terrain',
    'features',
    'initialize_light',
    'light',
    'spawn',
    'full'
] as const;

/** One rung of the generation ladder. A chunk is at exactly one of these at any moment. */
export type ChunkStatus = (typeof CHUNK_STATUSES)[number];

/** The storage a chunk uses at a status: a proto chunk below `full`, a finished chunk at `full`. */
export type ChunkStorageKind = 'proto_chunk' | 'level_chunk';

/** Raised when a value that is not one of {@link CHUNK_STATUSES} is read as a status. */
export class UnknownChunkStatusError extends Error {
    public override name = 'UnknownChunkStatusError';

    /** @param subject - The rejected value, quoted back to the caller in the message. */
    public constructor(public readonly subject: unknown) {
        super(`${JSON.stringify(subject)} is not a chunk status. The ten are ${CHUNK_STATUSES.join(', ')}.`);
    }
}

const INDEX_BY_STATUS = new Map<string, number>(CHUNK_STATUSES.map((status, index) => [status, index]));

/**
 * The position of a status on the ladder, with `empty` at 0 and `full` at 9.
 *
 * This is Java's `ChunkStatus.getIndex()`, and it is the only ordering this package uses.
 *
 * @throws UnknownChunkStatusError when the value is not one of the ten statuses.
 */
export const indexOfStatus = (status: ChunkStatus): number => {
    const index = INDEX_BY_STATUS.get(status);
    if (index === undefined) throw new UnknownChunkStatusError(status);
    return index;
};

/**
 * The status at a ladder position, for walking the ladder by index.
 *
 * @throws UnknownChunkStatusError when no status sits at that index.
 */
export const statusAtIndex = (index: number): ChunkStatus => {
    const status = CHUNK_STATUSES[index];
    if (status === undefined) throw new UnknownChunkStatusError(index);
    return status;
};

/** Narrows an unvalidated value, such as a persisted status read back from disk. */
export const isChunkStatus = (value: unknown): value is ChunkStatus =>
    typeof value === 'string' && INDEX_BY_STATUS.has(value);

/** The status a chunk must have reached before this one can run, or undefined for `empty`. */
export const parentOfStatus = (status: ChunkStatus): ChunkStatus | undefined =>
    status === 'empty' ? undefined : statusAtIndex(indexOfStatus(status) - 1);

/** True when `status` is `other` or any status above it. */
export const isOrAfter = (status: ChunkStatus, other: ChunkStatus): boolean =>
    indexOfStatus(status) >= indexOfStatus(other);

/** True when `status` is `other` or any status below it. */
export const isOrBefore = (status: ChunkStatus, other: ChunkStatus): boolean =>
    indexOfStatus(status) <= indexOfStatus(other);

/** The higher of two statuses. This is how the step builder merges overlapping requirements. */
export const maxStatus = (a: ChunkStatus, b: ChunkStatus): ChunkStatus => (isOrAfter(a, b) ? a : b);

/**
 * Which storage a chunk at this status lives in.
 *
 * Every status below `full` operates on a proto chunk. `full` promotes it, reusing the same
 * section storage rather than copying it.
 */
export const storageKindOf = (status: ChunkStatus): ChunkStorageKind =>
    status === 'full' ? 'level_chunk' : 'proto_chunk';
