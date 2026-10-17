import { compareBytewise, findShortSuccessor, findShortestSeparator } from '../util/Comparator';

/**
 * What a key looks like once it is inside a table or a memtable: the user's key followed by an
 * 8 byte trailer packing the sequence number and the entry type.
 *
 * The ordering is the part that has to be exactly right. User keys ascend, but for one user key
 * the trailers *descend*, so the newest write sorts first and a lookup can stop at the first hit.
 * Reverse that and the game's own binary search inside a block silently lands on a stale value -
 * no error, just old terrain.
 */

export enum ValueType {
    Deletion = 0,
    Value = 1
}

/** Sorts before every real entry for a user key, so a seek lands on that key's newest version. */
export const MAX_SEQUENCE = (1n << 56n) - 1n;

export interface ParsedInternalKey {
    userKey: Buffer;
    sequence: bigint;
    type: ValueType;
}

export const encodeInternalKey = (userKey: Buffer, sequence: bigint, type: ValueType): Buffer => {
    const encoded = Buffer.allocUnsafe(userKey.byteLength + 8);
    userKey.copy(encoded, 0);
    encoded.writeBigUInt64LE((BigInt.asUintN(56, sequence) << 8n) | BigInt(type), userKey.byteLength);
    return encoded;
};

export const parseInternalKey = (key: Buffer): ParsedInternalKey => {
    if (key.byteLength < 8) {
        throw new RangeError(`Internal key is ${key.byteLength} bytes, the trailer alone is 8`);
    }

    const trailer = key.readBigUInt64LE(key.byteLength - 8);
    const type = Number(trailer & 0xffn);

    if (type !== ValueType.Deletion && type !== ValueType.Value) {
        throw new RangeError(`Internal key has value type ${type}`);
    }

    return { userKey: key.subarray(0, key.byteLength - 8), sequence: trailer >> 8n, type };
};

/** The user key an internal key was built from, without validating the trailer. */
export const extractUserKey = (key: Buffer): Buffer => key.subarray(0, key.byteLength - 8);

export const compareInternalKeys = (a: Buffer, b: Buffer): number => {
    const byUserKey = compareBytewise(extractUserKey(a), extractUserKey(b));
    if (byUserKey !== 0) return byUserKey;

    // Descending, so the newest sequence for a user key comes first.
    const aTrailer = a.readBigUInt64LE(a.byteLength - 8);
    const bTrailer = b.readBigUInt64LE(b.byteLength - 8);
    if (aTrailer > bTrailer) return -1;
    if (aTrailer < bTrailer) return 1;
    return 0;
};

/** The key to seek with when looking up a user key: its newest possible version. */
export const lookupKey = (userKey: Buffer, sequence: bigint): Buffer =>
    encodeInternalKey(userKey, sequence, ValueType.Value);

/**
 * The separator and successor a table's index block uses, shortened over the *user key* and then
 * given a fresh trailer.
 *
 * Shortening the raw bytes instead would be silently wrong: the result's last eight bytes are no
 * longer a sequence and type, so comparing it as an internal key reads a garbage trailer. Point
 * lookups then land in the wrong block and report a key that is right there as missing, while a
 * full scan - which never compares index keys - keeps working.
 */
export const findShortestInternalSeparator = (start: Buffer, limit: Buffer): Buffer => {
    const startUser = extractUserKey(start);
    const shortened = findShortestSeparator(startUser, extractUserKey(limit));

    if (shortened.byteLength < startUser.byteLength) {
        // A shorter user key with the largest possible trailer still sorts before every real
        // entry for that key, which is what an index separator has to do.
        return encodeInternalKey(shortened, MAX_SEQUENCE, ValueType.Value);
    }

    return start;
};

export const findShortInternalSuccessor = (key: Buffer): Buffer => {
    const userKey = extractUserKey(key);
    const shortened = findShortSuccessor(userKey);

    if (shortened.byteLength < userKey.byteLength || compareBytewise(shortened, userKey) > 0) {
        return encodeInternalKey(shortened, MAX_SEQUENCE, ValueType.Value);
    }

    return key;
};
