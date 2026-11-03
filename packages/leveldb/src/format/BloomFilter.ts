const BLOOM_HASH_SEED = 0xbc9f1d34;
const BLOOM_HASH_MULTIPLIER = 0xc6a4a793;
const BLOOM_HASH_SHIFT = 24;
const MINIMUM_FILTER_BITS = 64;
const DEFAULT_BITS_PER_KEY = 10;

/**
 * Builds the byte layout used by LevelDB's `leveldb.BuiltinBloomFilter2` policy.
 *
 * @param keys - User keys represented by this filter.
 * @param bitsPerKey - Target filter size, defaulting to ten bits for each key.
 * @returns A bit array followed by the encoded probe count.
 */
export const createBloomFilter2 = (keys: readonly Buffer[], bitsPerKey = DEFAULT_BITS_PER_KEY): Buffer => {
    if (!Number.isSafeInteger(bitsPerKey) || bitsPerKey < 1) {
        throw new RangeError(`Bloom filter bits per key must be a positive safe integer: ${bitsPerKey}`);
    }

    if (keys.length === 0) return Buffer.alloc(0);

    const bitCount = Math.max(MINIMUM_FILTER_BITS, keys.length * bitsPerKey);
    const byteCount = Math.ceil(bitCount / 8);
    const roundedBitCount = byteCount * 8;
    const probeCount = Math.max(1, Math.min(30, Math.floor(bitsPerKey * 0.69)));
    const filter = Buffer.alloc(byteCount + 1);
    filter[byteCount] = probeCount;

    for (const key of keys) {
        let hash = bloomHash(key);
        const delta = ((hash >>> 17) | (hash << 15)) >>> 0;

        for (let probe = 0; probe < probeCount; probe++) {
            const bit = hash % roundedBitCount;
            filter[bit >>> 3]! |= 1 << (bit & 7);
            hash = (hash + delta) >>> 0;
        }
    }

    return filter;
};

/**
 * Whether the filter can contain `key`; malformed filters conservatively return true.
 *
 * @param key - The user key to check.
 * @param filter - A filter produced by {@link createBloomFilter2} or LevelDB.
 * @returns False only when a required bit is absent.
 */
export const bloomFilter2MayContain = (key: Buffer, filter: Buffer): boolean => {
    if (filter.byteLength < 2) return true;

    const bitCount = (filter.byteLength - 1) * 8;
    const probeCount = filter.readUInt8(filter.byteLength - 1);
    if (probeCount > 30 || bitCount === 0) return true;

    let hash = bloomHash(key);
    const delta = ((hash >>> 17) | (hash << 15)) >>> 0;

    for (let probe = 0; probe < probeCount; probe++) {
        const bit = hash % bitCount;
        if ((filter[bit >>> 3]! & (1 << (bit & 7))) === 0) return false;
        hash = (hash + delta) >>> 0;
    }

    return true;
};

/** LevelDB's Murmur-derived 32-bit hash used by BuiltinBloomFilter2. */
const bloomHash = (key: Buffer): number => {
    let hash = (BLOOM_HASH_SEED ^ Math.imul(key.byteLength, BLOOM_HASH_MULTIPLIER)) >>> 0;
    let offset = 0;

    while (key.byteLength - offset >= 4) {
        hash = (hash + key.readUInt32LE(offset)) >>> 0;
        hash = Math.imul(hash, BLOOM_HASH_MULTIPLIER) >>> 0;
        hash = (hash ^ (hash >>> 16)) >>> 0;
        offset += 4;
    }

    switch (key.byteLength - offset) {
        case 3:
            hash = (hash + (key.readUInt8(offset + 2) << 16)) >>> 0;
        // fall through
        case 2:
            hash = (hash + (key.readUInt8(offset + 1) << 8)) >>> 0;
        // fall through
        case 1:
            hash = (hash + key.readUInt8(offset)) >>> 0;
            hash = Math.imul(hash, BLOOM_HASH_MULTIPLIER) >>> 0;
            hash = (hash ^ (hash >>> BLOOM_HASH_SHIFT)) >>> 0;
            break;
    }

    return hash;
};
