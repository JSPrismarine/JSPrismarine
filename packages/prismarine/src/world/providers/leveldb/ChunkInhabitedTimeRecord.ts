/**
 * This project's per-chunk inhabited time record: Java's `InhabitedTime`, the ticks players have
 * spent near the chunk, which ramps the regional difficulty there. Bedrock keeps no such counter
 * in its chunk records, so the record sits under its own key prefix, which BDS never reads, as
 * {@link import('./ChunkGenerationRecord').CHUNK_GENERATION_PREFIX} does.
 */

/**
 * Prefix of the record. The key carries the chunk's x, z and dimension as three little endian
 * int32s, the dimension always present.
 */
export const CHUNK_INHABITED_TIME_PREFIX = Buffer.from('jsprismarine:chunk_inhabited_time:', 'ascii');

/** The record key for a chunk. */
export const encodeChunkInhabitedTimeKey = (x: number, z: number, dimension: number): Buffer => {
    const coordinates = Buffer.allocUnsafe(12);
    coordinates.writeInt32LE(x, 0);
    coordinates.writeInt32LE(z, 4);
    coordinates.writeInt32LE(dimension, 8);
    return Buffer.concat([CHUNK_INHABITED_TIME_PREFIX, coordinates]);
};

/** The record value: the ticks as a little endian int64, Java's `long`. */
export const encodeChunkInhabitedTime = (ticks: number): Buffer => {
    const value = Buffer.allocUnsafe(8);
    value.writeBigInt64LE(BigInt(Math.max(0, Math.floor(ticks))));
    return value;
};

/** Reads a record, or undefined for one that is not eight bytes or holds a negative count. */
export const decodeChunkInhabitedTime = (value: Buffer): number | undefined => {
    if (value.length !== 8) return undefined;
    const ticks = value.readBigInt64LE();
    return ticks < 0n ? undefined : Number(ticks);
};
