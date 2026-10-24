import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import type { SampleContext } from '../density/SampleContext';
import { clamp, clampedMap, floor, floorDiv, map, quantize, quartFromBlock, quartToBlock } from '../math';
import type { PositionalRandomFactory } from '../random/RandomSource';
import type { AquiferConfig } from '../settings/NoiseGeneratorSettings';
import type { FluidPicker } from './FluidPicker';
import { AIR, FluidStatus, LAVA, WATER } from './FluidPicker';

const X_RANGE = 10;
const Y_RANGE = 9;
const Z_RANGE = 10;
const X_SPACING = 16;
const Y_SPACING = 12;
const Z_SPACING = 16;
const SAMPLE_OFFSET_X = -5;
const SAMPLE_OFFSET_Y = 1;
const SAMPLE_OFFSET_Z = -5;
const SURFACE_LEVEL_ADJUSTMENT = 8;
const SIMILARITY_THRESHOLD = 25;

/** Java's `DimensionType.WAY_BELOW_MIN_Y`, the level that means "no fluid at all". */
export const WAY_BELOW_MIN_Y = -32512;

/** Java's `DimensionType.MIN_Y`, the lowest block a packed position can address. */
export const DIMENSION_MIN_Y = -2032;

/** The 13 chunk offsets an aquifer cell checks for a nearby surface. */
const SURFACE_SAMPLING_OFFSETS_IN_CHUNKS: readonly (readonly [number, number])[] = [
    [0, 0],
    [-2, -1],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [1, 0],
    [-2, 1],
    [-1, 1],
    [0, 1],
    [1, 1]
];

const gridX = (block: number): number => floorDiv(block, X_SPACING);
const gridY = (block: number): number => floorDiv(block, Y_SPACING);
const gridZ = (block: number): number => floorDiv(block, Z_SPACING);
const fromGridX = (grid: number, offset: number): number => grid * X_SPACING + offset;
const fromGridY = (grid: number, offset: number): number => grid * Y_SPACING + offset;
const fromGridZ = (grid: number, offset: number): number => grid * Z_SPACING + offset;

const similarity = (distanceSqr1: number, distanceSqr2: number): number =>
    1 - (distanceSqr2 - distanceSqr1) / SIMILARITY_THRESHOLD;

/** Below this similarity two neighboring cells are far enough apart not to exchange fluid. */
const FLOWING_UPDATE_SIMILARITY = similarity(X_RANGE * X_RANGE, Y_SPACING * Y_SPACING);

/** The block extent one aquifer covers, which is normally one chunk column. */
export interface AquiferVolume {
    /** The lowest block x in the extent. */
    readonly minBlockX: number;
    /** The lowest block y in the extent. */
    readonly minBlockY: number;
    /** The lowest block z in the extent. */
    readonly minBlockZ: number;
    /** The highest block x in the extent, inclusive. */
    readonly maxBlockX: number;
    /** The highest block y in the extent, inclusive. */
    readonly maxBlockY: number;
    /** The highest block z in the extent, inclusive. */
    readonly maxBlockZ: number;
}

/** Decides what fills a position once the terrain density says it is not stone. */
export interface Aquifer {
    /**
     * Returns the block that fills a position, or undefined to leave the default block there.
     *
     * @param density - The final density at the position; positive means solid.
     */
    computeSubstance(x: number, y: number, z: number, density: number): string | undefined;
    /** Whether the last {@link Aquifer.computeSubstance} call wants a fluid tick scheduled. */
    shouldScheduleFluidUpdate(): boolean;
}

/** The aquifer a dimension without an `aquifers` block uses: the global fluid and nothing else. */
export const createDisabledAquifer = (fluidPicker: FluidPicker): Aquifer => ({
    computeSubstance: (x, y, z, density) => (density > 0 ? undefined : fluidPicker(x, y, z).at(y)),
    shouldScheduleFluidUpdate: () => false
});

/**
 * The noise-driven aquifer: a jittered 16 by 12 by 16 grid of cells, each with its own fluid
 * surface, separated by stone barriers where two neighbors disagree.
 *
 * This is the stage that puts lakes inside caves and keeps the ocean from draining into them.
 * It reads six density functions and one positional random, and it is the only part of the
 * density stage that draws random numbers.
 */
export class NoiseBasedAquifer implements Aquifer {
    private readonly aquiferCache: (FluidStatus | undefined)[];
    private readonly locationX: Int32Array;
    private readonly locationY: Int32Array;
    private readonly locationZ: Int32Array;
    private readonly locationKnown: Uint8Array;
    private readonly surfaceLevelCache = new Map<number, Map<number, number>>();
    private readonly minGridX: number;
    private readonly minGridY: number;
    private readonly minGridZ: number;
    private readonly gridSizeX: number;
    private readonly gridSizeZ: number;
    private readonly skipSamplingAboveY: number;
    private scheduleFluidUpdate = false;
    private readonly barrierNoise: DensitySampler;
    private readonly floodednessNoise: DensitySampler;
    private readonly spreadNoise: DensitySampler;
    private readonly lavaNoise: DensitySampler;
    private readonly exclusion: DensitySampler;
    private readonly surfaceLevelSampler: DensitySampler;

    public constructor(
        private readonly context: SampleContext,
        samplers: {
            barrier: DensitySampler;
            floodedness: DensitySampler;
            spread: DensitySampler;
            lava: DensitySampler;
            exclusion: DensitySampler;
            surfaceLevel: DensitySampler;
        },
        private readonly positionalRandomFactory: PositionalRandomFactory,
        volume: AquiferVolume,
        private readonly globalFluidPicker: FluidPicker
    ) {
        this.barrierNoise = samplers.barrier;
        this.floodednessNoise = samplers.floodedness;
        this.spreadNoise = samplers.spread;
        this.lavaNoise = samplers.lava;
        this.exclusion = samplers.exclusion;
        this.surfaceLevelSampler = samplers.surfaceLevel;

        this.minGridX = gridX(volume.minBlockX + SAMPLE_OFFSET_X);
        const maxGridX = gridX(volume.maxBlockX + SAMPLE_OFFSET_X) + 1;
        this.gridSizeX = maxGridX - this.minGridX + 1;
        this.minGridY = gridY(volume.minBlockY + SAMPLE_OFFSET_Y) - 1;
        const maxGridY = gridY(volume.maxBlockY + SAMPLE_OFFSET_Y) + 1;
        const gridSizeY = maxGridY - this.minGridY + 1;
        this.minGridZ = gridZ(volume.minBlockZ + SAMPLE_OFFSET_Z);
        const maxGridZ = gridZ(volume.maxBlockZ + SAMPLE_OFFSET_Z) + 1;
        this.gridSizeZ = maxGridZ - this.minGridZ + 1;

        const totalGridSize = this.gridSizeX * gridSizeY * this.gridSizeZ;
        this.aquiferCache = new Array(totalGridSize).fill(undefined);
        this.locationX = new Int32Array(totalGridSize);
        this.locationY = new Int32Array(totalGridSize);
        this.locationZ = new Int32Array(totalGridSize);
        this.locationKnown = new Uint8Array(totalGridSize);

        const maxAdjusted = this.adjustSurfaceLevel(
            this.maxSurfaceLevel(
                fromGridX(this.minGridX, 0),
                fromGridZ(this.minGridZ, 0),
                fromGridX(maxGridX, Y_RANGE),
                fromGridZ(maxGridZ, Y_RANGE)
            )
        );
        this.skipSamplingAboveY = fromGridY(gridY(maxAdjusted + Y_SPACING) + 1, Y_SPACING - 1) - 1;
    }

    /** @inheritDoc */
    public shouldScheduleFluidUpdate(): boolean {
        return this.scheduleFluidUpdate;
    }

    /** @inheritDoc */
    public computeSubstance(blockX: number, blockY: number, blockZ: number, density: number): string | undefined {
        if (density > 0) {
            this.scheduleFluidUpdate = false;
            return undefined;
        }

        const globalFluid = this.globalFluidPicker(blockX, blockY, blockZ);
        if (blockY > this.skipSamplingAboveY) {
            this.scheduleFluidUpdate = false;
            return globalFluid.at(blockY);
        }
        if (globalFluid.at(blockY) === LAVA) {
            this.scheduleFluidUpdate = false;
            return LAVA;
        }

        const xAnchor = gridX(blockX + SAMPLE_OFFSET_X);
        const yAnchor = gridY(blockY + SAMPLE_OFFSET_Y);
        const zAnchor = gridZ(blockZ + SAMPLE_OFFSET_Z);
        let distance1 = Number.MAX_SAFE_INTEGER;
        let distance2 = Number.MAX_SAFE_INTEGER;
        let distance3 = Number.MAX_SAFE_INTEGER;
        let distance4 = Number.MAX_SAFE_INTEGER;
        let closest1 = 0;
        let closest2 = 0;
        let closest3 = 0;
        let closest4 = 0;

        for (let dx = 0; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = 0; dz <= 1; dz++) {
                    const index = this.getIndex(xAnchor + dx, yAnchor + dy, zAnchor + dz);
                    if (this.locationKnown[index] === 0) {
                        const random = this.positionalRandomFactory.at(xAnchor + dx, yAnchor + dy, zAnchor + dz);
                        this.locationX[index] = fromGridX(xAnchor + dx, random.nextIntBounded(X_RANGE));
                        this.locationY[index] = fromGridY(yAnchor + dy, random.nextIntBounded(Y_RANGE));
                        this.locationZ[index] = fromGridZ(zAnchor + dz, random.nextIntBounded(Z_RANGE));
                        this.locationKnown[index] = 1;
                    }

                    const offsetX = (this.locationX[index] ?? 0) - blockX;
                    const offsetY = (this.locationY[index] ?? 0) - blockY;
                    const offsetZ = (this.locationZ[index] ?? 0) - blockZ;
                    const newDistance = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
                    if (distance1 >= newDistance) {
                        closest4 = closest3;
                        closest3 = closest2;
                        closest2 = closest1;
                        closest1 = index;
                        distance4 = distance3;
                        distance3 = distance2;
                        distance2 = distance1;
                        distance1 = newDistance;
                    } else if (distance2 >= newDistance) {
                        closest4 = closest3;
                        closest3 = closest2;
                        closest2 = index;
                        distance4 = distance3;
                        distance3 = distance2;
                        distance2 = newDistance;
                    } else if (distance3 >= newDistance) {
                        closest4 = closest3;
                        closest3 = index;
                        distance4 = distance3;
                        distance3 = newDistance;
                    } else if (distance4 >= newDistance) {
                        closest4 = index;
                        distance4 = newDistance;
                    }
                }
            }
        }

        const status1 = this.getAquiferStatus(closest1);
        const similarity12 = similarity(distance1, distance2);
        const fluidState = status1.at(blockY);

        if (similarity12 <= 0) {
            if (similarity12 >= FLOWING_UPDATE_SIMILARITY) {
                this.scheduleFluidUpdate = !status1.equals(this.getAquiferStatus(closest2));
            } else {
                this.scheduleFluidUpdate = false;
            }
            return fluidState;
        }

        if (fluidState === WATER && this.globalFluidPicker(blockX, blockY - 1, blockZ).at(blockY - 1) === LAVA) {
            this.scheduleFluidUpdate = true;
            return fluidState;
        }

        let barrierNoiseValue = Number.NaN;
        const pressure = (first: FluidStatus, second: FluidStatus): number => {
            const [value, noiseValue] = this.calculatePressure(
                blockX,
                blockY,
                blockZ,
                barrierNoiseValue,
                first,
                second
            );
            barrierNoiseValue = noiseValue;
            return value;
        };

        const status2 = this.getAquiferStatus(closest2);
        if (density + similarity12 * pressure(status1, status2) > 0) {
            this.scheduleFluidUpdate = false;
            return undefined;
        }

        const status3 = this.getAquiferStatus(closest3);
        const similarity13 = similarity(distance1, distance3);
        if (similarity13 > 0 && density + similarity12 * similarity13 * pressure(status1, status3) > 0) {
            this.scheduleFluidUpdate = false;
            return undefined;
        }

        const similarity23 = similarity(distance2, distance3);
        if (similarity23 > 0 && density + similarity12 * similarity23 * pressure(status2, status3) > 0) {
            this.scheduleFluidUpdate = false;
            return undefined;
        }

        const mayFlow12 = !status1.equals(status2);
        const mayFlow23 = similarity23 >= FLOWING_UPDATE_SIMILARITY && !status2.equals(status3);
        const mayFlow13 = similarity13 >= FLOWING_UPDATE_SIMILARITY && !status1.equals(status3);
        this.scheduleFluidUpdate =
            mayFlow12 || mayFlow23 || mayFlow13
                ? true
                : similarity13 >= FLOWING_UPDATE_SIMILARITY &&
                  similarity(distance1, distance4) >= FLOWING_UPDATE_SIMILARITY &&
                  !status1.equals(this.getAquiferStatus(closest4));
        return fluidState;
    }

    private getIndex(cellX: number, cellY: number, cellZ: number): number {
        const x = cellX - this.minGridX;
        const y = cellY - this.minGridY;
        const z = cellZ - this.minGridZ;
        return (y * this.gridSizeZ + z) * this.gridSizeX + x;
    }

    private surfaceLevel(blockX: number, blockZ: number): number {
        const quantizedX = quartToBlock(quartFromBlock(blockX));
        const quantizedZ = quartToBlock(quartFromBlock(blockZ));
        let row = this.surfaceLevelCache.get(quantizedX);
        if (!row) {
            row = new Map();
            this.surfaceLevelCache.set(quantizedX, row);
        }
        const cached = row.get(quantizedZ);
        if (cached !== undefined) return cached;
        const level = floor(this.surfaceLevelSampler(this.context, quantizedX, 0, quantizedZ));
        row.set(quantizedZ, level);
        return level;
    }

    private maxSurfaceLevel(minBlockX: number, minBlockZ: number, maxBlockX: number, maxBlockZ: number): number {
        const minQuartX = quartFromBlock(minBlockX);
        const maxQuartX = quartFromBlock(maxBlockX);
        const minQuartZ = quartFromBlock(minBlockZ);
        const maxQuartZ = quartFromBlock(maxBlockZ);
        let maxY = -Number.MAX_SAFE_INTEGER;
        for (let quartZ = minQuartZ; quartZ <= maxQuartZ; quartZ++) {
            for (let quartX = minQuartX; quartX <= maxQuartX; quartX++) {
                maxY = Math.max(maxY, this.surfaceLevel(quartToBlock(quartX), quartToBlock(quartZ)));
            }
        }
        return maxY;
    }

    private adjustSurfaceLevel(preliminarySurfaceLevel: number): number {
        return preliminarySurfaceLevel + SURFACE_LEVEL_ADJUSTMENT;
    }

    private getAquiferStatus(index: number): FluidStatus {
        const cached = this.aquiferCache[index];
        if (cached) return cached;
        const status = this.computeFluid(
            this.locationX[index] ?? 0,
            this.locationY[index] ?? 0,
            this.locationZ[index] ?? 0
        );
        this.aquiferCache[index] = status;
        return status;
    }

    private computeFluid(x: number, y: number, z: number): FluidStatus {
        const globalFluid = this.globalFluidPicker(x, y, z);
        let lowestPreliminarySurface = Number.MAX_SAFE_INTEGER;
        const topOfAquiferCell = y + Y_SPACING;
        const bottomOfAquiferCell = y - Y_SPACING;
        let surfaceAtCenterIsUnderGlobalFluidLevel = false;

        for (const [offsetX, offsetZ] of SURFACE_SAMPLING_OFFSETS_IN_CHUNKS) {
            const sampleX = x + (offsetX << 4);
            const sampleZ = z + (offsetZ << 4);
            const surfaceLevel = this.surfaceLevel(sampleX, sampleZ);
            const adjustedSurfaceLevel = this.adjustSurfaceLevel(surfaceLevel);
            const start = offsetX === 0 && offsetZ === 0;
            if (start && bottomOfAquiferCell > adjustedSurfaceLevel) return globalFluid;

            const pokesAboveSurface = topOfAquiferCell > adjustedSurfaceLevel;
            if (pokesAboveSurface || start) {
                const globalFluidAtSurface = this.globalFluidPicker(sampleX, adjustedSurfaceLevel, sampleZ);
                if (globalFluidAtSurface.at(adjustedSurfaceLevel) !== AIR) {
                    if (start) surfaceAtCenterIsUnderGlobalFluidLevel = true;
                    if (pokesAboveSurface) return globalFluidAtSurface;
                }
            }

            lowestPreliminarySurface = Math.min(lowestPreliminarySurface, surfaceLevel);
        }

        const fluidSurfaceLevel = this.computeSurfaceLevel(
            x,
            y,
            z,
            globalFluid,
            lowestPreliminarySurface,
            surfaceAtCenterIsUnderGlobalFluidLevel
        );
        return new FluidStatus(fluidSurfaceLevel, this.computeFluidType(x, y, z, globalFluid, fluidSurfaceLevel));
    }

    private computeSurfaceLevel(
        x: number,
        y: number,
        z: number,
        globalFluid: FluidStatus,
        lowestSurfaceLevel: number,
        surfaceAtCenterIsUnderGlobalFluidLevel: boolean
    ): number {
        let partiallyFloodedness: number;
        let fullyFloodedness: number;
        if (this.exclusion(this.context, x, y, z) > 0) {
            partiallyFloodedness = -1;
            fullyFloodedness = -1;
        } else {
            const distanceBelowSurface = this.adjustSurfaceLevel(lowestSurfaceLevel) - y;
            const floodednessFactor = surfaceAtCenterIsUnderGlobalFluidLevel
                ? clampedMap(distanceBelowSurface, 0, 64, 1, 0)
                : 0;
            const floodednessNoiseValue = clamp(this.floodednessNoise(this.context, x, y, z), -1, 1);
            partiallyFloodedness = floodednessNoiseValue - map(floodednessFactor, 1, 0, -0.8, 0.4);
            fullyFloodedness = floodednessNoiseValue - map(floodednessFactor, 1, 0, -0.3, 0.8);
        }

        if (fullyFloodedness > 0) return globalFluid.fluidLevel;
        if (partiallyFloodedness > 0) return this.computeRandomizedFluidSurfaceLevel(x, y, z, lowestSurfaceLevel);
        return WAY_BELOW_MIN_Y;
    }

    private computeRandomizedFluidSurfaceLevel(x: number, y: number, z: number, lowestSurfaceLevel: number): number {
        const fluidLevelCellX = floorDiv(x, 16);
        const fluidLevelCellY = floorDiv(y, 40);
        const fluidLevelCellZ = floorDiv(z, 16);
        const fluidCellMiddleY = fluidLevelCellY * 40 + 20;
        const spread = this.spreadNoise(this.context, fluidLevelCellX, fluidLevelCellY, fluidLevelCellZ) * 10;
        return Math.min(lowestSurfaceLevel, fluidCellMiddleY + quantize(spread, 3));
    }

    private computeFluidType(
        x: number,
        y: number,
        z: number,
        globalFluid: FluidStatus,
        fluidSurfaceLevel: number
    ): string {
        if (fluidSurfaceLevel <= -10 && fluidSurfaceLevel !== WAY_BELOW_MIN_Y && globalFluid.fluidType !== LAVA) {
            const lavaNoiseValue = this.lavaNoise(this.context, floorDiv(x, 64), floorDiv(y, 40), floorDiv(z, 64));
            if (Math.abs(lavaNoiseValue) > 0.3) return LAVA;
        }
        return globalFluid.fluidType;
    }

    /**
     * The barrier strength between two aquifer cells.
     *
     * @returns The pressure and the barrier noise value, which the caller carries forward so
     *   the noise is sampled at most once per position, as Java's mutable holder does.
     */
    private calculatePressure(
        blockX: number,
        blockY: number,
        blockZ: number,
        barrierNoiseValue: number,
        statusClosest1: FluidStatus,
        statusClosest2: FluidStatus
    ): [number, number] {
        const type1 = statusClosest1.at(blockY);
        const type2 = statusClosest2.at(blockY);
        if ((type1 === LAVA && type2 === WATER) || (type1 === WATER && type2 === LAVA)) return [2, barrierNoiseValue];

        const fluidYDiff = Math.abs(statusClosest1.fluidLevel - statusClosest2.fluidLevel);
        if (fluidYDiff === 0) return [0, barrierNoiseValue];

        const averageFluidY = 0.5 * (statusClosest1.fluidLevel + statusClosest2.fluidLevel);
        const howFarAboveAverage = blockY + 0.5 - averageFluidY;
        const distanceFromEdge = fluidYDiff / 2 - Math.abs(howFarAboveAverage);

        let gradient: number;
        if (howFarAboveAverage > 0) {
            gradient = distanceFromEdge > 0 ? distanceFromEdge / 1.5 : distanceFromEdge / 2.5;
        } else {
            const centerPoint = 3 + distanceFromEdge;
            gradient = centerPoint > 0 ? centerPoint / 3 : centerPoint / 10;
        }

        if (gradient < -2 || gradient > 2) return [2 * (0 + gradient), barrierNoiseValue];

        const noiseValue = Number.isNaN(barrierNoiseValue)
            ? this.barrierNoise(this.context, blockX, blockY, blockZ)
            : barrierNoiseValue;
        return [2 * (noiseValue + gradient), noiseValue];
    }
}

/** Builds the aquifer for one chunk extent from its parsed configuration. */
export const createNoiseAquifer = (
    config: AquiferConfig,
    compile: (node: DensityFunctionNode) => DensitySampler,
    context: SampleContext,
    positionalRandomFactory: PositionalRandomFactory,
    volume: AquiferVolume,
    globalFluidPicker: FluidPicker
): Aquifer =>
    new NoiseBasedAquifer(
        context,
        {
            barrier: compile(config.barrierNoise),
            floodedness: compile(config.fluidLevelFloodednessNoise),
            spread: compile(config.fluidLevelSpreadNoise),
            lava: compile(config.lavaNoise),
            exclusion: compile(config.exclusion),
            surfaceLevel: compile(config.surfaceLevel)
        },
        positionalRandomFactory,
        volume,
        globalFluidPicker
    );
