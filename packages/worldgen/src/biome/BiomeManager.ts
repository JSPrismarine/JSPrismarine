import { createHash } from 'node:crypto';

import { asLong } from '../random/randomSupport';
import { mulLow64 } from '../random/longLanes';
import type { BiomeResolver } from './BiomeSource';

const LCG_MULTIPLIER = 6364136223846793005n;
const LCG_INCREMENT = 1442695040888963407n;
const UINT32_MASK = 0xffffffffn;
const LCG_MULTIPLIER_HI = Number((LCG_MULTIPLIER >> 32n) & UINT32_MASK);
const LCG_MULTIPLIER_LO = Number(LCG_MULTIPLIER & UINT32_MASK);
const LCG_INCREMENT_HI = Number((LCG_INCREMENT >> 32n) & UINT32_MASK);
const LCG_INCREMENT_LO = Number(LCG_INCREMENT & UINT32_MASK);

/** Java's `LinearCongruentialGenerator.next`, using the shared exact 64-bit lane multiplier. */
const lcgNext = (
    seedHi: number,
    seedLo: number,
    valueHi: number,
    valueLo: number,
    result: { hi: number; lo: number },
    product: { hi: number; lo: number }
): void => {
    // LinearCongruentialGenerator.next is seed * (seed * multiplier + increment) + value,
    // with each result reduced modulo 2^64; reusing two lane objects avoids per-miss allocations.
    mulLow64(seedHi, seedLo, seedHi, seedLo, product);
    const squareHi = product.hi;
    const squareLo = product.lo;
    mulLow64(squareHi, squareLo, LCG_MULTIPLIER_HI, LCG_MULTIPLIER_LO, product);
    let sumHi = product.hi;
    let sumLo = product.lo;
    mulLow64(seedHi, seedLo, LCG_INCREMENT_HI, LCG_INCREMENT_LO, product);
    let sum = sumLo + product.lo;
    sumHi = (sumHi + product.hi + (sum > 0xffffffff ? 1 : 0)) >>> 0;
    sumLo = sum >>> 0;
    sum = sumLo + valueLo;
    result.hi = (sumHi + valueHi + (sum > 0xffffffff ? 1 : 0)) >>> 0;
    result.lo = sum >>> 0;
};

/** Turns bits 24 through 33 into the jitter Java adds to a cell's distance. */
const fiddle = (hi: number, lo: number): number => ((((lo >>> 24) | (hi << 8)) & 1023) / 1024 - 0.5) * 0.9;

/** Writes one lattice point's three jitter offsets into `target` at `offset`. */
const fiddleOffsets = (
    seedHi: number,
    seedLo: number,
    cellX: number,
    cellY: number,
    cellZ: number,
    target: Float64Array,
    offset: number,
    value: { hi: number; lo: number },
    product: { hi: number; lo: number }
): void => {
    const xHi = cellX < 0 ? 0xffffffff : 0;
    const xLo = cellX >>> 0;
    const yHi = cellY < 0 ? 0xffffffff : 0;
    const yLo = cellY >>> 0;
    const zHi = cellZ < 0 ? 0xffffffff : 0;
    const zLo = cellZ >>> 0;
    lcgNext(seedHi, seedLo, xHi, xLo, value, product);
    lcgNext(value.hi, value.lo, yHi, yLo, value, product);
    lcgNext(value.hi, value.lo, zHi, zLo, value, product);
    lcgNext(value.hi, value.lo, xHi, xLo, value, product);
    lcgNext(value.hi, value.lo, yHi, yLo, value, product);
    lcgNext(value.hi, value.lo, zHi, zLo, value, product);
    target[offset] = fiddle(value.hi, value.lo);
    lcgNext(value.hi, value.lo, seedHi, seedLo, value, product);
    target[offset + 1] = fiddle(value.hi, value.lo);
    lcgNext(value.hi, value.lo, seedHi, seedLo, value, product);
    target[offset + 2] = fiddle(value.hi, value.lo);
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
    private readonly cornerJitterOffsets = new Int32Array(8);
    private readonly xDistanceSquares = new Float64Array(8 * 4);
    private readonly zDistanceSquares = new Float64Array(8 * 4);
    private readonly jitterValue = { hi: 0, lo: 0 };
    private readonly jitterProduct = { hi: 0, lo: 0 };
    private cachedParentX = 0;
    private cachedParentY = 0;
    private cachedParentZ = 0;
    private hasCachedParentCell = false;
    private readonly zoomSeedHi: number;
    private readonly zoomSeedLo: number;

    public constructor(
        private readonly resolver: BiomeResolver,
        /** The jitter seed, which Java derives from the world seed with {@link obfuscateSeed}. */
        public readonly zoomSeed: bigint
    ) {
        const unsignedSeed = BigInt.asUintN(64, zoomSeed);
        this.zoomSeedHi = Number(unsignedSeed >> 32n);
        this.zoomSeedLo = Number(unsignedSeed & UINT32_MASK);
    }

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
        const fractY = (absY & 3) / 4;
        const fractionX = absX & 3;
        const fractionZ = absZ & 3;

        if (
            !this.hasCachedParentCell ||
            this.cachedParentX !== parentX ||
            this.cachedParentY !== parentY ||
            this.cachedParentZ !== parentZ
        ) {
            this.cacheParentCell(parentX, parentY, parentZ);
        }

        const jitter = this.jitter;

        let bestCorner = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let corner = 0; corner < 8; corner++) {
            const yEven = (corner & 2) === 0;
            const offset = this.cornerJitterOffsets[corner] ?? 0;
            const dy = (yEven ? fractY : fractY - 1) + (jitter[offset + 1] ?? 0);
            // Keep Java's left-to-right grouping: (dz² + dy²) + dx².
            const distance =
                (this.zDistanceSquares[corner * 4 + fractionZ] ?? 0) +
                dy * dy +
                (this.xDistanceSquares[corner * 4 + fractionX] ?? 0);
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

    /** Caches the eight corner offsets and their x/z squares for one parent biome cell. */
    private cacheParentCell(parentX: number, parentY: number, parentZ: number): void {
        const jitter = this.jitter;
        for (let corner = 0; corner < 8; corner++) {
            const xEven = (corner & 4) === 0;
            const yEven = (corner & 2) === 0;
            const zEven = (corner & 1) === 0;
            const offset = this.jitterAt(
                xEven ? parentX : parentX + 1,
                yEven ? parentY : parentY + 1,
                zEven ? parentZ : parentZ + 1
            );
            this.cornerJitterOffsets[corner] = offset;

            for (let fraction = 0; fraction < 4; fraction++) {
                const distanceX = (xEven ? fraction / 4 : fraction / 4 - 1) + (jitter[offset] ?? 0);
                const distanceZ = (zEven ? fraction / 4 : fraction / 4 - 1) + (jitter[offset + 2] ?? 0);
                this.xDistanceSquares[corner * 4 + fraction] = distanceX * distanceX;
                this.zDistanceSquares[corner * 4 + fraction] = distanceZ * distanceZ;
            }
        }

        this.cachedParentX = parentX;
        this.cachedParentY = parentY;
        this.cachedParentZ = parentZ;
        this.hasCachedParentCell = true;
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

        fiddleOffsets(
            this.zoomSeedHi,
            this.zoomSeedLo,
            pointX,
            pointY,
            pointZ,
            this.jitter,
            offset,
            this.jitterValue,
            this.jitterProduct
        );
        this.jitterKeyX[slot] = pointX;
        this.jitterKeyY[slot] = pointY;
        this.jitterKeyZ[slot] = pointZ;
        this.jitterFilled[slot] = 1;
        return offset;
    }
}
