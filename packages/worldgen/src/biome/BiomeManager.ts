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

const fiddledDistance = (
    seed: bigint,
    cellX: number,
    cellY: number,
    cellZ: number,
    distanceX: number,
    distanceY: number,
    distanceZ: number
): number => {
    const x = BigInt(cellX);
    const y = BigInt(cellY);
    const z = BigInt(cellZ);
    let value = lcgNext(seed, x);
    value = lcgNext(value, y);
    value = lcgNext(value, z);
    value = lcgNext(value, x);
    value = lcgNext(value, y);
    value = lcgNext(value, z);
    const fiddleX = fiddle(value);
    value = lcgNext(value, seed);
    const fiddleY = fiddle(value);
    value = lcgNext(value, seed);
    const fiddleZ = fiddle(value);
    const dz = distanceZ + fiddleZ;
    const dy = distanceY + fiddleY;
    const dx = distanceX + fiddleX;
    return dz * dz + dy * dy + dx * dx;
};

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

        let bestCorner = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let corner = 0; corner < 8; corner++) {
            const xEven = (corner & 4) === 0;
            const yEven = (corner & 2) === 0;
            const zEven = (corner & 1) === 0;
            const distance = fiddledDistance(
                this.zoomSeed,
                xEven ? parentX : parentX + 1,
                yEven ? parentY : parentY + 1,
                zEven ? parentZ : parentZ + 1,
                xEven ? fractX : fractX - 1,
                yEven ? fractY : fractY - 1,
                zEven ? fractZ : fractZ - 1
            );
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
}
