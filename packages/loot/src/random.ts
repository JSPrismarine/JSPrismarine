import { createHash } from 'node:crypto';

import type { RandomSource } from '@jsprismarine/predicates';

/**
 * Java's `random_sequence` rule, reproduced bit for bit.
 *
 * A loot table names a sequence id, and the server keeps one Xoroshiro128++
 * stream per id, seeded from the world seed exclusive-ored with the MD5 hash
 * of the id. Two worlds with the same seed therefore break the same ore into
 * the same drops, and two tables in one world never share a stream.
 */

const MASK_64 = 0xffffffffffffffffn;

/** The 64-bit two's-complement wrap Java applies to every `long` operation. */
const asLong = (value: bigint): bigint => BigInt.asIntN(64, value);

/** Java's `RandomSupport.GOLDEN_RATIO_64`. */
const GOLDEN_RATIO_64 = -7046029254386353131n;

/** Java's `RandomSupport.SILVER_RATIO_64`. */
const SILVER_RATIO_64 = 7640891576956012809n;

/** Java's `XoroshiroRandomSource.FLOAT_MULTIPLIER`, as a 32-bit float. */
const FLOAT_UNIT = Math.fround(5.9604645e-8);

interface Seed128 {
    readonly lo: bigint;
    readonly hi: bigint;
}

/** Stafford's variant 13 mix, the avalanche step Java runs over each half of an upgraded seed. */
const mixStafford13 = (value: bigint): bigint => {
    let mixed = asLong(value);
    mixed = asLong((mixed ^ (BigInt.asUintN(64, mixed) >> 30n)) * -4658895280553007687n);
    mixed = asLong((mixed ^ (BigInt.asUintN(64, mixed) >> 27n)) * -7723592293110705685n);
    return asLong(mixed ^ (BigInt.asUintN(64, mixed) >> 31n));
};

const upgradeUnmixed = (worldSeed: bigint): Seed128 => {
    const lo = asLong(asLong(worldSeed) ^ SILVER_RATIO_64);
    return { lo, hi: asLong(lo + GOLDEN_RATIO_64) };
};

const longAt = (bytes: Uint8Array, offset: number): bigint => {
    let value = 0n;
    for (let index = 0; index < 8; index += 1) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
    return asLong(value);
};

/** Java's `RandomSupport.seedFromHashOf`: the MD5 digest read as two big-endian 64-bit halves. */
const seedFromHashOf = (name: string): Seed128 => {
    const digest = createHash('md5').update(name, 'utf8').digest();
    return { lo: longAt(digest, 0), hi: longAt(digest, 8) };
};

const rotateLeft = (value: bigint, shift: bigint): bigint => {
    const unsigned = BigInt.asUintN(64, value);
    return asLong(((unsigned << shift) & MASK_64) | (unsigned >> (64n - shift)));
};

/**
 * Java's `XoroshiroRandomSource`, narrowed to the two draws the loot grammar
 * makes. The generator is the same one world generation uses, so a host that
 * already has one may inject it instead through the predicate context.
 */
class XoroshiroLootRandom implements RandomSource {
    private lo: bigint;
    private hi: bigint;

    public constructor(state: Seed128) {
        // An all-zero state is a fixed point of the recurrence, so Java substitutes a constant.
        if ((asLong(state.lo) | asLong(state.hi)) === 0n) {
            this.lo = GOLDEN_RATIO_64;
            this.hi = SILVER_RATIO_64;
        } else {
            this.lo = asLong(state.lo);
            this.hi = asLong(state.hi);
        }
    }

    /** @inheritDoc */
    public nextFloat(): number {
        const bits = BigInt.asUintN(64, this.nextLong()) >> 40n;
        return Math.fround(Math.fround(Number(bits)) * FLOAT_UNIT);
    }

    /** @inheritDoc */
    public nextInt(bound: number): number {
        if (bound <= 0) return 0;

        const wide = BigInt(bound);
        let product = BigInt(this.nextIntRaw() >>> 0) * wide;
        let remainder = product & 0xffffffffn;
        if (remainder < wide) {
            // Lemire's rejection bound: the first multiple of `bound` at or above 2^32 mod bound.
            const threshold = BigInt((-bound >>> 0) % bound);
            while (remainder < threshold) {
                product = BigInt(this.nextIntRaw() >>> 0) * wide;
                remainder = product & 0xffffffffn;
            }
        }
        return Number(BigInt.asIntN(32, product >> 32n));
    }

    private nextIntRaw(): number {
        return Number(BigInt.asIntN(32, this.nextLong()));
    }

    private nextLong(): bigint {
        const lo = this.lo;
        let hi = this.hi;
        const result = asLong(rotateLeft(asLong(lo + hi), 17n) + lo);
        hi = asLong(hi ^ lo);
        this.lo = asLong(rotateLeft(lo, 49n) ^ hi ^ ((hi << 21n) & MASK_64));
        this.hi = rotateLeft(hi, 28n);
        return result;
    }
}

/**
 * Builds the stream a loot table draws from, the way Java's `RandomSequence`
 * does: upgrade the world seed to 128 bits, exclusive-or the MD5 hash of the
 * sequence id over it when the table names one, then mix both halves.
 *
 * @param worldSeed - The world seed as a signed 64-bit value.
 * @param sequence - The table's `random_sequence` id. Omitting it gives the
 * stream `RandomSource.create(worldSeed)` produces, which is what Java falls
 * back to for a table that names no sequence.
 */
export const lootSequenceRandom = (worldSeed: bigint, sequence?: string): RandomSource => {
    const base = upgradeUnmixed(worldSeed);
    const keyed = sequence === undefined ? base : hashInto(base, seedFromHashOf(sequence));
    return new XoroshiroLootRandom({ lo: mixStafford13(keyed.lo), hi: mixStafford13(keyed.hi) });
};

const hashInto = (seed: Seed128, key: Seed128): Seed128 => ({
    lo: asLong(seed.lo ^ key.lo),
    hi: asLong(seed.hi ^ key.hi)
});

/**
 * One stream per sequence id for one world, which is what Java's
 * `RandomSequences` holds and saves with the world.
 *
 * Rolling the same table twice must not replay the same draws, so a sequence
 * is created once and then advances. Tables that name no sequence share one
 * unkeyed stream, standing in for Java's level random.
 */
export class LootSequences {
    private readonly streams = new Map<string, RandomSource>();
    private readonly unkeyed: RandomSource;

    public constructor(public readonly worldSeed: bigint) {
        this.unkeyed = lootSequenceRandom(worldSeed);
    }

    /** Returns the stream for a `random_sequence` id, creating it on first use. */
    public forSequence(sequence: string | undefined): RandomSource {
        if (sequence === undefined) return this.unkeyed;

        const existing = this.streams.get(sequence);
        if (existing) return existing;

        const created = lootSequenceRandom(this.worldSeed, sequence);
        this.streams.set(sequence, created);
        return created;
    }
}
