/**
 * Java's `Blender`: bends a new chunk's terrain toward the old chunks around it.
 *
 * A new chunk within seven chunks of an old one is generated with three overrides in its
 * density graph. `blend_alpha` and `blend_offset` pull the terrain's shape toward the surface
 * heights the old chunks recorded on their edges, fading out over 28 cells (112 blocks).
 * `blend_density` mixes the final density toward the old edge densities within two cells. The
 * chunk's stored biomes take the old edge biomes near the seam, and carvers keep four blocks away
 * from the old terrain.
 *
 * Everything here reads the {@link BlendingData} records the caller hands in. Deciding which
 * chunks are old, and reading their blocks, belongs to whoever stores the chunks.
 */
import type { SampleContext } from '../density/SampleContext';
import { clamp, f32 } from '../math';
import type { Noise } from '../noise/GradientNoise';
import { NormalNoise } from '../noise/NormalNoise';
import { XoroshiroRandomSource } from '../random/XoroshiroRandomSource';
import type { BlendingData, Direction8 } from './BlendingData';
import { BLENDING_NO_VALUE, DIRECTIONS_8 } from './BlendingData';
import { LongHashOrder, packChunkPos } from './longHashOrder';

/** `QuartPos.fromSection(7) - 1`: how far, in cells, an old surface height pulls new terrain. */
const HEIGHT_BLENDING_RANGE_CELLS = 7 * 4 - 1;

/** `QuartPos.toSection(HEIGHT_BLENDING_RANGE_CELLS + 3)`: the chunk radius that reach covers. */
export const HEIGHT_BLENDING_RANGE_CHUNKS = (HEIGHT_BLENDING_RANGE_CELLS + 3) >> 2;

/** `QuartPos.toSection(5)`: the chunk radius whose densities can reach a new chunk. */
const DENSITY_BLENDING_RANGE_CHUNKS = 5 >> 2;

/** How far, in cells, an old edge density reaches. */
const DENSITY_BLENDING_RANGE_CELLS = 2;

/** Carvers stop this many blocks short of old terrain. */
const OLD_CHUNK_CARVING_DISTANCE = 4;

/** Java's `blendOffsetAndFactor` result. */
export interface BlendingOutput {
    /** How much of the new terrain's own shape survives, 0 at an old edge and 1 far from one. */
    readonly alpha: number;
    /** The terrain offset that puts the surface at the blended old height. */
    readonly blendingOffset: number;
}

/**
 * Whether a marked carver block may be opened, by chunk-local x and z and absolute y; Java's
 * `CarvingMask.Filter`.
 */
export type CarvingFilter = (localX: number, y: number, localZ: number) => boolean;

/** The old chunks a blender reads, by chunk position; undefined for a chunk that is not old. */
export type OldChunkLookup = (chunkX: number, chunkZ: number) => BlendingData | undefined;

const NO_BLENDING: BlendingOutput = { alpha: 1, blendingOffset: 0 };

let shiftNoise: Noise | undefined;

/**
 * Java's `Blender.SHIFT_NOISE`: `NoiseData.DEFAULT_SHIFT` bound to `new XoroshiroRandomSource(42)`.
 *
 * Built on first use. It does not depend on the world seed, so one instance serves every world.
 */
export const blendingShiftNoise = (): Noise => {
    shiftNoise ??= NormalNoise.parity(-3, [1, 1, 1, 0]).create(XoroshiroRandomSource.fromSeed(42n));
    return shiftNoise;
};

/** Java's `Mth.length(float, float)`. */
const lengthF2 = (x: number, z: number): number => f32(Math.sqrt(f32(f32(x * x) + f32(z * z))));

/** Java's `Mth.length(float, float, float)`. */
const lengthF3 = (x: number, y: number, z: number): number =>
    f32(Math.sqrt(f32(f32(f32(x * x) + f32(y * y)) + f32(z * z))));

/** Java's `heightToOffset`: the `blend_offset` that moves the surface to a target height. */
const heightToOffset = (height: number): number => {
    const targetY = height + 0.5;
    const targetYMod = ((targetY % 8) + 8) % 8;
    return (
        (32 * (targetY - 128) - 3 * (targetY - 120) * targetYMod + 3 * targetYMod * targetYMod) /
        (128 * (32 - 3 * targetYMod))
    );
};

/** Java's `distanceToCube`. */
const distanceToCube = (x: number, y: number, z: number, radiusX: number, radiusY: number, radiusZ: number): number => {
    const deltaX = Math.max(0, Math.abs(x) - radiusX);
    const deltaY = Math.max(0, Math.abs(y) - radiusY);
    const deltaZ = Math.max(0, Math.abs(z) - radiusZ);
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
};

/** One old chunk in the order Java's map walks them, with its first cell. */
interface PlacedBlendingData {
    readonly minCellX: number;
    readonly minCellZ: number;
    readonly data: BlendingData;
}

/** A distance from a point to the nearest old chunk's volume, in blocks. */
type DistanceGetter = (x: number, y: number, z: number) => number;

/** Java's `makeOffsetOldChunkDistanceGetter`, for the center chunk or one of its eight neighbors. */
const offsetOldChunkDistance = (stepX: number, stepZ: number, data: BlendingData): DistanceGetter => {
    const offsetX = stepX * 16;
    const offsetZ = stepZ * 16;
    const radiusY = data.height / 2;
    const centerY = data.minY + radiusY;
    return (x, y, z) => distanceToCube(x - 8 - offsetX, y - centerY, z - 8 - offsetZ, 8, radiusY, 8);
};

/**
 * The blender for one chunk being generated.
 *
 * Build it with {@link Blender.of}; {@link Blender.EMPTY} is the blender of a chunk with no old
 * chunk near it, and it changes nothing.
 */
export class Blender {
    /** The blender that changes nothing, Java's `Blender.empty()`. */
    public static readonly EMPTY = new Blender([], [], new LongHashOrder<PlacedBlendingData>(), undefined);

    private readonly offsetCache = new Map<number, BlendingOutput>();

    private constructor(
        private readonly heightAndBiomeData: readonly PlacedBlendingData[],
        private readonly densityData: readonly PlacedBlendingData[],
        private readonly byChunk: LongHashOrder<PlacedBlendingData>,
        /** Java's carving filter, or undefined when nothing old is next to the chunk. */
        public readonly carvingFilter: CarvingFilter | undefined
    ) {}

    /**
     * Java's `Blender.of`: the blender for the chunk at `centerX, centerZ`.
     *
     * @param oldChunkAt - The old chunks' records, already calculated against their own
     *   neighbors. It is asked about every chunk within `HEIGHT_BLENDING_RANGE_CHUNKS` of the
     *   center.
     */
    public static of(centerX: number, centerZ: number, oldChunkAt: OldChunkLookup): Blender {
        const range = HEIGHT_BLENDING_RANGE_CHUNKS;
        let anyOld = false;
        for (let dx = -range; dx <= range && !anyOld; dx++) {
            for (let dz = -range; dz <= range; dz++) {
                if (oldChunkAt(centerX + dx, centerZ + dz) !== undefined) {
                    anyOld = true;
                    break;
                }
            }
        }
        if (!anyOld) return Blender.EMPTY;

        const heightAndBiome = new LongHashOrder<PlacedBlendingData>();
        const density = new LongHashOrder<PlacedBlendingData>();
        const maxDistanceSquared = (range + 1) * (range + 1);
        for (let dx = -range; dx <= range; dx++) {
            for (let dz = -range; dz <= range; dz++) {
                if (dx * dx + dz * dz > maxDistanceSquared) continue;

                const chunkX = centerX + dx;
                const chunkZ = centerZ + dz;
                const data = oldChunkAt(chunkX, chunkZ);
                if (data === undefined) continue;

                const placed: PlacedBlendingData = { minCellX: chunkX * 4, minCellZ: chunkZ * 4, data };
                const key = packChunkPos(chunkX, chunkZ);
                heightAndBiome.put(key, placed);
                if (Math.abs(dx) <= DENSITY_BLENDING_RANGE_CHUNKS && Math.abs(dz) <= DENSITY_BLENDING_RANGE_CHUNKS) {
                    density.put(key, placed);
                }
            }
        }

        const carvingFilter = Blender.carvingFilterAround(centerX, centerZ, oldChunkAt);
        if (heightAndBiome.length === 0 && density.length === 0 && carvingFilter === undefined) return Blender.EMPTY;

        return new Blender(heightAndBiome.ordered(), density.ordered(), heightAndBiome, carvingFilter);
    }

    /** Whether the blender changes nothing. */
    public isEmpty(): boolean {
        return (
            this.heightAndBiomeData.length === 0 && this.densityData.length === 0 && this.carvingFilter === undefined
        );
    }

    /**
     * Java's `blendOffsetAndFactor` for the cell column holding a block.
     *
     * Both values depend only on the cell, so they are cached per cell.
     */
    public blendOffsetAndFactor(blockX: number, blockZ: number): BlendingOutput {
        if (this === Blender.EMPTY) return NO_BLENDING;

        const cellX = blockX >> 2;
        const cellZ = blockZ >> 2;
        // Two 26-bit halves cover every cell a world border allows, and the sum stays an exact double.
        const key = (cellX + 0x2000000) * 0x4000000 + (cellZ + 0x2000000);
        let output = this.offsetCache.get(key);
        if (output === undefined) {
            output = this.computeOffsetAndFactor(cellX, cellZ);
            this.offsetCache.set(key, output);
        }
        return output;
    }

    private computeOffsetAndFactor(cellX: number, cellZ: number): BlendingOutput {
        const fixedHeight = this.blendingDataValue(cellX, 0, cellZ, (data, x, y, z) => data.getHeight(x, y, z));
        if (fixedHeight !== BLENDING_NO_VALUE) {
            return { alpha: 0, blendingOffset: f32(heightToOffset(fixedHeight)) };
        }

        let totalWeight = 0;
        let weightedHeights = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const { minCellX, minCellZ, data } of this.heightAndBiomeData) {
            data.iterateHeights(minCellX, minCellZ, (testCellX, testCellZ, height) => {
                const distance = lengthF2(cellX - testCellX, cellZ - testCellZ);
                if (distance > HEIGHT_BLENDING_RANGE_CELLS) return;
                if (distance < closestDistance) closestDistance = distance;

                const weight = 1 / (distance * distance * distance * distance);
                weightedHeights += height * weight;
                totalWeight += weight;
            });
        }

        if (closestDistance === Number.POSITIVE_INFINITY) return NO_BLENDING;

        const averageHeight = weightedHeights / totalWeight;
        let alpha = clamp(closestDistance / (HEIGHT_BLENDING_RANGE_CELLS + 1), 0, 1);
        alpha = 3 * alpha * alpha - 2 * alpha * alpha * alpha;
        return { alpha: f32(alpha), blendingOffset: f32(heightToOffset(averageHeight)) };
    }

    /**
     * Java's `blendDensity`: the final density at a block, mixed toward the old edge densities
     * within two cells.
     */
    public blendDensity(blockX: number, blockY: number, blockZ: number, noiseValue: number): number {
        if (this === Blender.EMPTY) return noiseValue;

        const cellX = blockX >> 2;
        // Java's `blockY / 8` truncates toward zero, which is not the cell a negative y sits in.
        const cellY = Math.trunc(blockY / 8);
        const cellZ = blockZ >> 2;
        const fixedDensity = this.blendingDataValue(cellX, cellY, cellZ, (data, x, y, z) => data.getDensity(x, y, z));
        if (fixedDensity !== BLENDING_NO_VALUE) return fixedDensity;

        let totalWeight = 0;
        let weightedDensities = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const { minCellX, minCellZ, data } of this.densityData) {
            data.iterateDensities(
                minCellX,
                minCellZ,
                cellY - 1,
                cellY + 1,
                (testCellX, testCellY, testCellZ, density) => {
                    const distance = lengthF3(cellX - testCellX, (cellY - testCellY) * 2, cellZ - testCellZ);
                    if (distance > DENSITY_BLENDING_RANGE_CELLS) return;
                    if (distance < closestDistance) closestDistance = distance;

                    const weight = 1 / (distance * distance * distance * distance);
                    weightedDensities += density * weight;
                    totalWeight += weight;
                }
            );
        }

        if (closestDistance === Number.POSITIVE_INFINITY) return noiseValue;

        const averageDensity = weightedDensities / totalWeight;
        const alpha = clamp(closestDistance / 3, 0, 1);
        return f32(averageDensity + alpha * (noiseValue - averageDensity));
    }

    /**
     * Java's `getBlendingDataValue`: a fixed value from the old chunk that owns a cell, trying the
     * chunks to the west, north and north-west for a cell on their shared edge.
     */
    private blendingDataValue(
        cellX: number,
        cellY: number,
        cellZ: number,
        get: (data: BlendingData, cellX: number, cellY: number, cellZ: number) => number
    ): number {
        const chunkX = cellX >> 2;
        const chunkZ = cellZ >> 2;
        const minX = (cellX & 3) === 0;
        const minZ = (cellZ & 3) === 0;

        const at = (x: number, z: number): number => {
            const placed = this.byChunk.get(packChunkPos(x, z));
            return placed === undefined ? BLENDING_NO_VALUE : get(placed.data, cellX - x * 4, cellY, cellZ - z * 4);
        };

        let value = at(chunkX, chunkZ);
        if (value !== BLENDING_NO_VALUE) return value;
        if (minX && minZ) value = at(chunkX - 1, chunkZ - 1);
        if (value !== BLENDING_NO_VALUE) return value;
        if (minX) value = at(chunkX - 1, chunkZ);
        if (value === BLENDING_NO_VALUE && minZ) value = at(chunkX, chunkZ - 1);
        return value;
    }

    /**
     * Java's `blendBiome`: the old edge biome nearest a quart, when the quart is close enough to
     * take it, or undefined to keep the biome source's own answer.
     */
    public blendBiome(quartX: number, quartY: number, quartZ: number): string | undefined {
        let closestDistance = Number.POSITIVE_INFINITY;
        let closestBiome: string | undefined;
        for (const { minCellX, minCellZ, data } of this.heightAndBiomeData) {
            data.iterateBiomes(minCellX, quartY, minCellZ, (testCellX, testCellZ, biome) => {
                const distance = lengthF2(quartX - testCellX, quartZ - testCellZ);
                if (distance > HEIGHT_BLENDING_RANGE_CELLS) return;
                if (distance < closestDistance) {
                    closestBiome = biome;
                    closestDistance = distance;
                }
            });
        }

        if (closestDistance === Number.POSITIVE_INFINITY) return undefined;

        const shift = f32(blendingShiftNoise().get3(quartX, 0, quartZ) * 12);
        const alpha = clamp(f32(f32(closestDistance + shift) / (HEIGHT_BLENDING_RANGE_CELLS + 1)), 0, 1);
        return alpha > 0.5 ? undefined : closestBiome;
    }

    /**
     * Java's `getBiomeResolver`: a noise biome lookup that prefers {@link Blender.blendBiome}.
     *
     * @param resolve - The biome source's own lookup, by quart position.
     */
    public biomeResolver(
        resolve: (quartX: number, quartY: number, quartZ: number) => string
    ): (quartX: number, quartY: number, quartZ: number) => string {
        if (this.heightAndBiomeData.length === 0) return resolve;
        return (quartX, quartY, quartZ) => this.blendBiome(quartX, quartY, quartZ) ?? resolve(quartX, quartY, quartZ);
    }

    /**
     * Points a sample context's `blend_alpha`, `blend_offset` and `blend_density` at this
     * blender, or clears them for {@link Blender.EMPTY}.
     */
    public install(context: SampleContext): void {
        if (this.isEmpty()) {
            context.blendAlpha = undefined;
            context.blendOffset = undefined;
            context.blendDensity = undefined;
            return;
        }
        context.blendAlpha = (_context, x, _y, z) => this.blendOffsetAndFactor(x, z).alpha;
        context.blendOffset = (_context, x, _y, z) => this.blendOffsetAndFactor(x, z).blendingOffset;
        context.blendDensity = (x, y, z, density) => this.blendDensity(x, y, z, density);
    }

    /**
     * Java's `createAroundOldChunksCarvingMaskFilter`.
     *
     * 26.3's `applyCarvingMask` opens a marked block only where this filter answers true, and it
     * answers true within four blocks of old terrain. That is the reverse of 1.18, where the same
     * test marked blocks as already carved so carvers skipped them. The bytecode is unambiguous
     * (`NoiseBasedChunkGenerator.applyCarvingMask` and `Blender.lambda$createAroundOldChunks…`), so
     * this follows 26.3: next to an old chunk, caves open only near the old chunk.
     */
    private static carvingFilterAround(
        centerX: number,
        centerZ: number,
        oldChunkAt: OldChunkLookup
    ): CarvingFilter | undefined {
        const getters: DistanceGetter[] = [];
        const center = oldChunkAt(centerX, centerZ);
        if (center !== undefined) getters.push(offsetOldChunkDistance(0, 0, center));
        for (const { stepX, stepZ } of DIRECTIONS_8) {
            const data = oldChunkAt(centerX + stepX, centerZ + stepZ);
            if (data !== undefined) getters.push(offsetOldChunkDistance(stepX, stepZ, data));
        }
        if (getters.length === 0) return undefined;

        const noise = blendingShiftNoise();
        return (x, y, z) => {
            const shiftedX = x + 0.5 + f32(noise.get3(x, y, z) * 4);
            const shiftedY = y + 0.5 + f32(noise.get3(y, z, x) * 4);
            const shiftedZ = z + 0.5 + f32(noise.get3(z, x, y) * 4);
            let closest = Number.POSITIVE_INFINITY;
            for (const getter of getters) closest = Math.min(closest, getter(shiftedX, shiftedY, shiftedZ));
            return closest < OLD_CHUNK_CARVING_DISTANCE;
        };
    }
}

/**
 * Java's `BlendingData.sideByGenerationAge(region, x, z, false)`: which of a chunk's eight
 * neighbors are new generation, the sides an old chunk's record has to describe.
 *
 * @param isOld - Whether the chunk at a position is old generation.
 */
export const newSidesOf = (
    chunkX: number,
    chunkZ: number,
    isOld: (chunkX: number, chunkZ: number) => boolean
): Set<Direction8> => {
    const sides = new Set<Direction8>();
    for (const { direction, stepX, stepZ } of DIRECTIONS_8) {
        if (!isOld(chunkX + stepX, chunkZ + stepZ)) sides.add(direction);
    }
    return sides;
};
