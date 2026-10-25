import { createHash } from 'node:crypto';

import { asLong } from '../random/randomSupport';
import type { BiomeResolver } from './BiomeSource';

const LCG_MULTIPLIER = 6364136223846793005n;
const LCG_INCREMENT = 1442695040888963407n;

/** Java's `LinearCongruentialGenerator.next`, the mixing step the biome zoomer runs on. */
const lcgNext = (seed: bigint, value: bigint): bigint =>
    asLong(asLong(seed * asLong(asLong(seed * LCG_MULTIPLIER) + LCG_INCREMENT)) + value);

/** Turns one mixed value into the jitter Java adds to a cell's distance, in `[-0.45, 0.45)`. */
const fiddle = (value: bigint): number => {
    const shifted = value >> 24n;
    const modulus = ((shifted % 1024n) + 1024n) % 1024n;
    return (Number(modulus) / 1024 - 0.5) * 0.9;
};

/** Writes one lattice point's three jitter offsets into `target` at `offset`. */
const fiddleOffsets = (
    seed: bigint,
    cellX: number,
    cellY: number,
    cellZ: number,
    target: Float64Array,
    offset: number
): void => {
    const x = BigInt(cellX);
    const y = BigInt(cellY);
    const z = BigInt(cellZ);
    let value = lcgNext(seed, x);
    value = lcgNext(value, y);
    value = lcgNext(value, z);
    value = lcgNext(value, x);
    value = lcgNext(value, y);
    value = lcgNext(value, z);
    target[offset] = fiddle(value);
    value = lcgNext(value, seed);
    target[offset + 1] = fiddle(value);
    value = lcgNext(value, seed);
    target[offset + 2] = fiddle(value);
};

/** How many lattice points across x, and across z, the jitter cache indexes. */
const JITTER_POINTS_XZ = 8;

/** How many lattice points up the y axis the jitter cache indexes. */
const JITTER_POINTS_Y = 128;

/** The number of lattice points the jitter cache holds. */
const JITTER_SLOTS = JITTER_POINTS_XZ * JITTER_POINTS_XZ * JITTER_POINTS_Y;

/**
 * The per-block biome getter the surface pass reads.
 *
 * A biome source answers per 4 by 4 by 4 cell. Java does not snap a block to its own cell; it
 * picks whichever of the eight surrounding cell corners is nearest after a seeded jitter, so a
 * biome edge wanders by a block or two instead of following the cell grid. The surface pass
 * needs that, because a biome-conditioned rule resolved per chunk instead of per column puts
 * the wrong block on every column the chunk's other biomes own.
 */
export class BiomeManager {
    private readonly jitterKeyX = new Int32Array(JITTER_SLOTS);
    private readonly jitterKeyY = new Int32Array(JITTER_SLOTS);
    private readonly jitterKeyZ = new Int32Array(JITTER_SLOTS);
    private readonly jitterFilled = new Uint8Array(JITTER_SLOTS);
    private readonly jitter = new Float64Array(JITTER_SLOTS * 3);

    public constructor(
        private readonly resolver: BiomeResolver,
        /** The jitter seed, which Java derives from the world seed with {@link obfuscateSeed}. */
        public readonly zoomSeed: bigint
    ) {}

    /**
     * Derives the jitter seed from a world seed.
     *
     * Java hashes the seed with SHA-256 and reads the first eight bytes of the digest as a
     * little-endian `long`, which is Guava's `Hashing.sha256().hashLong(seed).asLong()`.
     */
    public static obfuscateSeed(seed: bigint): bigint {
        const input = Buffer.alloc(8);
        input.writeBigInt64LE(asLong(seed));
        return createHash('sha256').update(input).digest().readBigInt64LE(0);
    }

    /** Returns a source with the same jitter seed but a different biome layout. */
    public withResolver(resolver: BiomeResolver): BiomeManager {
        return new BiomeManager(resolver, this.zoomSeed);
    }

    /** Returns the biome identifier at one block position. */
    public getBiome(x: number, y: number, z: number): string {
        const absX = x - 2;
        const absY = y - 2;
        const absZ = z - 2;
        const parentX = absX >> 2;
        const parentY = absY >> 2;
        const parentZ = absZ >> 2;
        const fractX = (absX & 3) / 4;
        const fractY = (absY & 3) / 4;
        const fractZ = (absZ & 3) / 4;
        const jitter = this.jitter;

        let bestCorner = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let corner = 0; corner < 8; corner++) {
            const xEven = (corner & 4) === 0;
            const yEven = (corner & 2) === 0;
            const zEven = (corner & 1) === 0;
            const offset = this.jitterAt(
                xEven ? parentX : parentX + 1,
                yEven ? parentY : parentY + 1,
                zEven ? parentZ : parentZ + 1
            );
            const dz = (zEven ? fractZ : fractZ - 1) + (jitter[offset + 2] ?? 0);
            const dy = (yEven ? fractY : fractY - 1) + (jitter[offset + 1] ?? 0);
            const dx = (xEven ? fractX : fractX - 1) + (jitter[offset] ?? 0);
            const distance = dz * dz + dy * dy + dx * dx;
            if (bestDistance > distance) {
                bestCorner = corner;
                bestDistance = distance;
            }
        }

        return this.resolver(
            (bestCorner & 4) === 0 ? parentX : parentX + 1,
            (bestCorner & 2) === 0 ? parentY : parentY + 1,
            (bestCorner & 1) === 0 ? parentZ : parentZ + 1
        );
    }

    /**
     * Where one lattice point's three jitter offsets sit in {@link BiomeManager.jitter},
     * deriving them on first visit.
     *
     * The jitter of a point is nine `long` multiplications, and the surface pass asks for the
     * biome of every block, so a chunk would run that chain 786432 times for the 3528 points it
     * touches. The cache is direct-mapped on the lattice index, 8 by 8 by 128 points, which is
     * wider than the 6 by 6 by 98 one chunk works on; a point outside that window evicts rather
     * than grows, and the stored indices are compared exactly before a value is reused.
     */
    private jitterAt(pointX: number, pointY: number, pointZ: number): number {
        const slot =
            (pointX & (JITTER_POINTS_XZ - 1)) |
            ((pointZ & (JITTER_POINTS_XZ - 1)) << 3) |
            ((pointY & (JITTER_POINTS_Y - 1)) << 6);
        const offset = slot * 3;
        if (
            this.jitterFilled[slot] === 1 &&
            this.jitterKeyX[slot] === pointX &&
            this.jitterKeyY[slot] === pointY &&
            this.jitterKeyZ[slot] === pointZ
        ) {
            return offset;
        }

        fiddleOffsets(this.zoomSeed, pointX, pointY, pointZ, this.jitter, offset);
        this.jitterKeyX[slot] = pointX;
        this.jitterKeyY[slot] = pointY;
        this.jitterKeyZ[slot] = pointZ;
        this.jitterFilled[slot] = 1;
        return offset;
    }
}
