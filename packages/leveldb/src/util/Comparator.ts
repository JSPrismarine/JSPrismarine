/**
 * The name LevelDB records in the manifest for its default ordering. A database whose manifest
 * says anything else was written with a custom comparator whose ordering we do not know, and
 * reading it as if it were bytewise would silently return the wrong entries.
 */
export const BYTEWISE_COMPARATOR = 'leveldb.BytewiseComparator';

/** Unsigned lexicographic order, i.e. `memcmp`, with the shorter buffer first on a prefix tie. */
export const compareBytewise = (a: Buffer, b: Buffer): number => Buffer.compare(a, b);

/** How many leading bytes two keys have in common, which is what a data block's entries elide. */
export const sharedPrefixLength = (a: Buffer, b: Buffer): number => {
    const limit = Math.min(a.byteLength, b.byteLength);
    let shared = 0;
    while (shared < limit && a.readUInt8(shared) === b.readUInt8(shared)) shared++;
    return shared;
};

/**
 * The shortest key that still sorts at or after `limit` and after `start`, used for a data block's
 * index entry. Shortening is only an optimisation - `start` itself is always a valid answer - but
 * vanilla does it, and doing the same keeps our index blocks the same size as its.
 */
export const findShortestSeparator = (start: Buffer, limit: Buffer): Buffer => {
    const shared = sharedPrefixLength(start, limit);

    if (shared < Math.min(start.byteLength, limit.byteLength)) {
        const byte = start.readUInt8(shared);
        if (byte < 0xff && byte + 1 < limit.readUInt8(shared)) {
            const shortened = Buffer.from(start.subarray(0, shared + 1));
            shortened.writeUInt8(byte + 1, shared);
            return shortened;
        }
    }

    return start;
};

/** The same idea for the last block in a table, where there is no following key to stay below. */
export const findShortSuccessor = (key: Buffer): Buffer => {
    for (let i = 0; i < key.byteLength; i++) {
        const byte = key.readUInt8(i);
        if (byte !== 0xff) {
            const shortened = Buffer.from(key.subarray(0, i + 1));
            shortened.writeUInt8(byte + 1, i);
            return shortened;
        }
    }

    // Every byte was 0xff, so no shorter key sorts above it. The key itself will do.
    return key;
};
