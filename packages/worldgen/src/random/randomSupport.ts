import { createHash } from 'node:crypto';

/** The 64-bit two's-complement wrap Java applies to every `long` operation. */
export const asLong = (value: bigint): bigint => BigInt.asIntN(64, value);

/** The 32-bit two's-complement wrap Java applies to every `int` operation. */
export const asInt = (value: number): number => value | 0;

const UNSIGNED_64 = (value: bigint): bigint => BigInt.asUintN(64, value);

/** Java's `RandomSupport.GOLDEN_RATIO_64`, the odd constant the seed upgrade adds. */
export const GOLDEN_RATIO_64 = -7046029254386353131n;

/** Java's `RandomSupport.SILVER_RATIO_64`, the odd constant the seed upgrade exclusive-ors. */
export const SILVER_RATIO_64 = 7640891576956012809n;

/** A Xoroshiro128++ state: two 64-bit halves. */
export interface Seed128bit {
    /** The low half of the state. */
    readonly seedLo: bigint;
    /** The high half of the state. */
    readonly seedHi: bigint;
}

/**
 * Stafford's variant 13 mix, the avalanche step Java runs over each half of an upgraded seed.
 */
export const mixStafford13 = (value: bigint): bigint => {
    let z = asLong(value);
    z = asLong((z ^ (UNSIGNED_64(z) >> 30n)) * -4658895280553007687n);
    z = asLong((z ^ (UNSIGNED_64(z) >> 27n)) * -7723592293110705685n);
    return asLong(z ^ (UNSIGNED_64(z) >> 31n));
};

/** Spreads one 64-bit world seed into the unmixed 128-bit pair, before the avalanche step. */
export const upgradeSeedTo128bitUnmixed = (legacySeed: bigint): Seed128bit => {
    const seedLo = asLong(asLong(legacySeed) ^ SILVER_RATIO_64);
    return { seedLo, seedHi: asLong(seedLo + GOLDEN_RATIO_64) };
};

/** Spreads one 64-bit world seed into the 128-bit state Xoroshiro128++ starts from. */
export const upgradeSeedTo128bit = (legacySeed: bigint): Seed128bit => {
    const unmixed = upgradeSeedTo128bitUnmixed(legacySeed);
    return { seedLo: mixStafford13(unmixed.seedLo), seedHi: mixStafford13(unmixed.seedHi) };
};

/** Exclusive-ors a 128-bit state with another, which is how a positional factory keys a name. */
export const xorSeed = (seed: Seed128bit, lo: bigint, hi: bigint): Seed128bit => ({
    seedLo: asLong(seed.seedLo ^ lo),
    seedHi: asLong(seed.seedHi ^ hi)
});

const longFromBytes = (bytes: Uint8Array, offset: number): bigint => {
    let value = 0n;
    for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(bytes[offset + i] ?? 0);
    return asLong(value);
};

/**
 * Hashes a name into a 128-bit state the way Java does: the MD5 digest of its UTF-8 bytes,
 * read as two big-endian 64-bit halves.
 */
export const seedFromHashOf = (name: string): Seed128bit => {
    const digest = createHash('md5').update(name, 'utf8').digest();
    return { seedLo: longFromBytes(digest, 0), seedHi: longFromBytes(digest, 8) };
};

/**
 * Java's `Mth.getSeed`: the position hash both positional factories mix into their state.
 *
 * The `x * 3129871` term overflows as a 32-bit `int` before it widens, which is why this
 * truncates that product rather than computing it in 64 bits.
 */
export const positionalSeed = (x: number, y: number, z: number): bigint => {
    const xTerm = BigInt(Math.imul(asInt(x), 3129871));
    let seed = asLong(xTerm ^ asLong(BigInt(asInt(z)) * 116129781n) ^ BigInt(asInt(y)));
    seed = asLong(asLong(asLong(seed * seed) * 42317861n) + asLong(seed * 11n));
    return asLong(seed >> 16n);
};

/** Java's `String.hashCode`, which the legacy positional factory uses in place of MD5. */
export const javaStringHashCode = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = asInt(Math.imul(hash, 31) + value.charCodeAt(i));
    return hash;
};
