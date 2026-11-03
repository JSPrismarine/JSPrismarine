/** A compact key for coordinate pairs, with a collision-free string fallback. */
export type CoordinatePairKey = number | string;

/** Exact key for one world block position. */
export type BlockPositionKey = bigint | string;

/** Two signed 26-bit coordinates fit in one exactly represented JavaScript number. */
const PAIR_BITS = 26;
const PAIR_OFFSET = 2 ** (PAIR_BITS - 1);
const PAIR_SPAN = 2 ** PAIR_BITS;

/** World block heights normally fit in this compact local-position key. */
const MIN_PACKED_Y = -2048;
const MAX_PACKED_Y = 2047;
const POSITION_XZ_OFFSET = 2 ** 25;

/**
 * Packs two in-range integer coordinates without losing identity.
 *
 * The fallback is kept as a string because JavaScript numbers cannot exactly represent every
 * coordinate pair outside this range. Numeric and string Map keys occupy separate key domains.
 * @param {number} first - The first coordinate.
 * @param {number} second - The second coordinate.
 * @returns {CoordinatePairKey} A numeric key, or the exact coordinate pair as a string.
 */
export const coordinatePairKey = (first: number, second: number): CoordinatePairKey => {
    if (
        Number.isSafeInteger(first) &&
        Number.isSafeInteger(second) &&
        first >= -PAIR_OFFSET &&
        first < PAIR_OFFSET &&
        second >= -PAIR_OFFSET &&
        second < PAIR_OFFSET
    )
        return (first + PAIR_OFFSET) * PAIR_SPAN + (second + PAIR_OFFSET);

    return `${first},${second}`;
};

/**
 * The chunk and local position keys for one block coordinate.
 *
 * The nested keys keep the full supported world border and height unique without allocating a
 * string per block. Unusual heights and fractional coordinates retain exact string identities.
 * @param {number} x - World x.
 * @param {number} y - World y.
 * @param {number} z - World z.
 * @returns {{ chunk: CoordinatePairKey; position: CoordinatePairKey }} The packed chunk and local keys.
 */
export const blockPositionKeys = (
    x: number,
    y: number,
    z: number
): { readonly chunk: CoordinatePairKey; readonly position: CoordinatePairKey } => {
    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    const localX = x - chunkX * 16;
    const localZ = z - chunkZ * 16;
    const chunk = coordinatePairKey(chunkX, chunkZ);

    if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && y >= MIN_PACKED_Y && y <= MAX_PACKED_Y) {
        const position = ((y - MIN_PACKED_Y) * 16 + localX) * 16 + localZ;
        return { chunk, position };
    }

    return { chunk, position: `${x},${y},${z}` };
};

/**
 * Packs a supported integer block position into one exact integer key.
 *
 * The world border needs 26 bits each for x and z, and the supported vertical range needs 12 for
 * y, which exceeds JavaScript's 53-bit `number` precision. BigInt keeps the existing one-map
 * deduplication and insertion order while avoiding a string allocation for ordinary blocks.
 * @param {number} x - World x.
 * @param {number} y - World y.
 * @param {number} z - World z.
 * @returns {BlockPositionKey} An exact integer key, or a string for out-of-range positions.
 */
export const blockPositionKey = (x: number, y: number, z: number): BlockPositionKey => {
    if (
        Number.isSafeInteger(x) &&
        Number.isSafeInteger(y) &&
        Number.isSafeInteger(z) &&
        x >= -POSITION_XZ_OFFSET &&
        x < POSITION_XZ_OFFSET &&
        z >= -POSITION_XZ_OFFSET &&
        z < POSITION_XZ_OFFSET &&
        y >= MIN_PACKED_Y &&
        y <= MAX_PACKED_Y
    ) {
        const packedX = BigInt(x + POSITION_XZ_OFFSET);
        const packedY = BigInt(y - MIN_PACKED_Y);
        const packedZ = BigInt(z + POSITION_XZ_OFFSET);
        return (packedX << 38n) | (packedY << 26n) | packedZ;
    }

    return `${x},${y},${z}`;
};
