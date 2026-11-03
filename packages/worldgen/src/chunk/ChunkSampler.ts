import type { DensitySampler, DensityVolumeEvaluator } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import type { SampleContext } from '../density/SampleContext';
import type { RandomState } from '../RandomState';
import type { Aquifer, AquiferVolume } from './Aquifer';
import { createDisabledAquifer, createNoiseAquifer, NoiseBasedAquifer } from './Aquifer';
import type { FluidPicker } from './FluidPicker';
import { AIR, createGlobalFluidPicker } from './FluidPicker';

/** The registry name the aquifer random factory is keyed by. */
export const AQUIFER_SEED = 'minecraft:aquifer';

/** The side length of a chunk column in blocks. */
export const CHUNK_SIZE = 16;

/** Keeps per-evaluator intermediate arrays within the same cell-sized bound as interpolation buffers. */
const MAX_VOLUME_DENSITY_SAMPLES = 4096;

/** One block of a generated column. */
export interface ColumnBlock {
    /** The Java block state identifier, `minecraft:air` where nothing is placed. */
    readonly state: string;
    /** Whether the aquifer wants a fluid tick scheduled at this position. */
    readonly scheduleFluidUpdate: boolean;
}

/** Options for building a {@link ChunkSampler}. */
export interface ChunkSamplerOptions {
    /** The chunk x coordinate, in chunks. */
    readonly chunkX: number;
    /** The chunk z coordinate, in chunks. */
    readonly chunkZ: number;
    /** Overrides the dimension-wide fluid picker, which parity harnesses sometimes need. */
    readonly fluidPicker?: FluidPicker;
    /** An exclusive caller-owned context; reset and reuse it only after this sampler has finished. */
    readonly context?: SampleContext;
    /** Whether to skip proven cells whose final density cannot be positive. Defaults to true. */
    readonly skipProvenCells?: boolean;
    /** Re-samples skipped blocks through the scalar path and checks their states and fluid flags. */
    readonly verifySkippedCells?: boolean;
    /** Evaluates each visited interpolation cell into typed arrays instead of sampling each block. */
    readonly useVolumeDensity?: boolean;
}

interface InterpolatedDensityProof {
    readonly node: Extract<DensityFunctionNode, { type: 'interpolated' }>;
    readonly cellSizeXz: number;
    readonly cellSizeY: number;
}

/**
 * The vanilla final-density path whose sign can be proved from one interpolated node.
 *
 * Its exact shape is `min(squeeze(interpolated(input)), other) + beardifier`. If the runtime
 * beardifier is absent, it contributes zero. `min` cannot raise the squeezed value, and squeeze
 * preserves the sign. Unsupported graph shapes deliberately use per-block density sampling.
 */
const interpolatedDensityProofOf = (
    node: DensityFunctionNode
): Extract<DensityFunctionNode, { type: 'interpolated' }> | undefined => {
    if (node.type !== 'add' || node.right.type !== 'beardifier') return undefined;
    if (node.left.type !== 'min' || node.left.left.type !== 'squeeze') return undefined;

    const interpolated = node.left.left.input;
    return interpolated.type === 'interpolated' ? interpolated : undefined;
};

/**
 * Samples one chunk column: the final density per block, then the aquifer's verdict on what
 * fills the positions the density leaves open.
 *
 * 26.3 moved the cell interpolation that used to live in this class into the `interpolated`
 * density function, so there is no cell grid here any more. The overworld's `final_density`
 * carries `cell_size_xz: 4` and `cell_size_y: 8`, and the generator reads it per block.
 *
 * Block states come out as Java identifiers. Translating them to Bedrock belongs to
 * `@jsprismarine/mapping`, so nothing in this package knows about the Bedrock palette.
 */
export class ChunkSampler {
    /** The block extent this sampler covers. */
    public readonly volume: AquiferVolume;
    /** The per-chunk mutable state the compiled samplers read. */
    public readonly context: SampleContext;

    /**
     * How many interpolation cells {@link ChunkSampler.forEachCellBlock} splits the chunk into.
     *
     * One for a dimension whose density functions interpolate nothing, in which case that
     * method walks the chunk column by column exactly as {@link ChunkSampler.fill} does.
     */
    public readonly cellCount: number;

    private readonly finalDensity: DensitySampler;
    private readonly defaultBlock: string;
    private readonly cellSizeXz: number;
    private readonly cellSizeY: number;
    private readonly cellsX: number;
    private readonly cellsY: number;
    private readonly cellsZ: number;
    private readonly fluidPicker: FluidPicker;
    private readonly interpolatedDensityProof: InterpolatedDensityProof | undefined;
    private readonly volumeDensityEvaluator: DensityVolumeEvaluator | undefined;
    private readonly volumeDensityBounds:
        { minX: number; minY: number; minZ: number; sizeX: number; sizeY: number; sizeZ: number } | undefined;
    private readonly volumeDensityValues: Float64Array | undefined;
    private readonly skipProvenCells: boolean;
    private readonly verifySkippedCells: boolean;
    private skippedCells = 0;
    private skippedBlocks = 0;
    private densityCallsSkipped = 0;
    private aquiferCallsSkipped = 0;
    private noiseAquifer: Aquifer | undefined;
    private walkingCell = false;

    public constructor(
        private readonly randomState: RandomState,
        options: ChunkSamplerOptions
    ) {
        const settings = randomState.settings;
        const minBlockX = options.chunkX * CHUNK_SIZE;
        const minBlockZ = options.chunkZ * CHUNK_SIZE;
        this.volume = {
            minBlockX,
            minBlockY: settings.noiseSettings.minY,
            minBlockZ,
            maxBlockX: minBlockX + CHUNK_SIZE - 1,
            maxBlockY: settings.noiseSettings.minY + settings.noiseSettings.height - 1,
            maxBlockZ: minBlockZ + CHUNK_SIZE - 1
        };

        this.context = options.context ?? randomState.createContext();
        this.finalDensity = randomState.sampler(settings.noiseRouter.finalDensity);
        this.volumeDensityEvaluator = options.useVolumeDensity
            ? randomState.volumeSampler(settings.noiseRouter.finalDensity)
            : undefined;
        this.volumeDensityBounds = this.volumeDensityEvaluator
            ? { minX: 0, minY: 0, minZ: 0, sizeX: 0, sizeY: 0, sizeZ: 0 }
            : undefined;
        this.defaultBlock = settings.defaultBlock;
        this.verifySkippedCells = options.verifySkippedCells ?? false;

        const proofNode = interpolatedDensityProofOf(settings.noiseRouter.finalDensity);
        this.interpolatedDensityProof = proofNode
            ? {
                  node: proofNode,
                  cellSizeXz: proofNode.cellSizeXz,
                  cellSizeY: proofNode.cellSizeY
              }
            : undefined;
        this.skipProvenCells =
            (options.skipProvenCells ?? true) &&
            options.fluidPicker === undefined &&
            this.interpolatedDensityProof !== undefined;

        this.fluidPicker = options.fluidPicker ?? createGlobalFluidPicker(settings);

        // Taken from final density alone. The shared compiler also holds the surface pass's
        // `chunk_surface_level`, whose cell is 16 by 1, and once that compiles the compiler's
        // overall cell shrinks to 4 by 1 and a chunk walks 6144 cells instead of 768.
        const cell = randomState.interpolationCellSizeOf(settings.noiseRouter.finalDensity);
        this.cellSizeXz = cell?.xz ?? CHUNK_SIZE;
        this.cellSizeY = cell?.y ?? settings.noiseSettings.height;
        this.cellsX = this.cellSpan(this.volume.minBlockX, this.volume.maxBlockX, this.cellSizeXz);
        this.cellsY = this.cellSpan(this.volume.minBlockY, this.volume.maxBlockY, this.cellSizeY);
        this.cellsZ = this.cellSpan(this.volume.minBlockZ, this.volume.maxBlockZ, this.cellSizeXz);
        this.cellCount = this.cellsX * this.cellsY * this.cellsZ;

        const maximumCellXz = Math.min(this.cellSizeXz, CHUNK_SIZE);
        const maximumCellY = Math.min(this.cellSizeY, settings.noiseSettings.height);
        this.volumeDensityValues = this.volumeDensityEvaluator
            ? new Float64Array(Math.min(maximumCellXz * maximumCellXz * maximumCellY, MAX_VOLUME_DENSITY_SAMPLES))
            : undefined;
    }

    /**
     * The aquifer bound to this chunk, shared across every column in it.
     *
     * Built on first use. Its constructor samples the preliminary surface height of 121 quart
     * columns, which is 0.7 milliseconds that a sampler asked only for densities - a surface
     * probe, a structure height walk - never has to spend.
     */
    public get aquifer(): Aquifer {
        this.noiseAquifer ??= this.randomState.settings.aquifers
            ? createNoiseAquifer(
                  this.randomState.settings.aquifers,
                  (node) => this.randomState.sampler(node),
                  this.context,
                  this.randomState.randomFactory(AQUIFER_SEED),
                  this.volume,
                  this.fluidPicker
              )
            : createDisabledAquifer(this.fluidPicker);
        return this.noiseAquifer;
    }

    /** Counts the cells and per-block calls avoided by the proven-cell path. */
    public get cellSkipStats(): Readonly<{
        cellsSkipped: number;
        blocksSkipped: number;
        densityCallsSkipped: number;
        aquiferCallsSkipped: number;
    }> {
        return {
            cellsSkipped: this.skippedCells,
            blocksSkipped: this.skippedBlocks,
            densityCallsSkipped: this.densityCallsSkipped,
            aquiferCallsSkipped: this.aquiferCallsSkipped
        };
    }

    /** The final density at one block position. */
    public density(x: number, y: number, z: number): number {
        if (!this.walkingCell) return this.finalDensity(this.context, x, y, z);

        // Only the cell-major walk guarantees that a node's whole buffer belongs to this working set.
        const bufferingBeforeSample = this.context.interpolationBuffersEnabled;
        this.context.interpolationBuffersEnabled = true;
        try {
            return this.finalDensity(this.context, x, y, z);
        } finally {
            this.context.interpolationBuffersEnabled = bufferingBeforeSample;
        }
    }

    /** Samples one density function of this dimension at one block position. */
    public sample(node: Parameters<RandomState['sampler']>[0], x: number, y: number, z: number): number {
        return this.randomState.sampler(node)(this.context, x, y, z);
    }

    /**
     * Returns the block at one position, running the density and then the aquifer.
     *
     * Columns are generated from the top down because the aquifer's fluid update flag and its
     * surface probing both assume that order.
     */
    public blockAt(x: number, y: number, z: number): ColumnBlock {
        const substance = this.aquifer.computeSubstance(x, y, z, this.density(x, y, z));
        return {
            state: substance ?? this.defaultBlock,
            scheduleFluidUpdate:
                substance !== undefined && substance !== AIR && this.aquifer.shouldScheduleFluidUpdate()
        };
    }

    /** Visits a column from the top down without allocating one result object per block. */
    public forEachColumnBlock(
        x: number,
        z: number,
        visit: (y: number, state: string, scheduleFluidUpdate: boolean) => void
    ): void {
        for (let y = this.volume.maxBlockY; y >= this.volume.minBlockY; y--) {
            const substance = this.aquifer.computeSubstance(x, y, z, this.density(x, y, z));
            const state = substance ?? this.defaultBlock;
            const scheduleFluidUpdate =
                substance !== undefined && substance !== AIR && this.aquifer.shouldScheduleFluidUpdate();
            visit(y, state, scheduleFluidUpdate);
        }
    }

    /**
     * The highest y in a column whose block a predicate accepts, or undefined for none.
     *
     * This is the walk Java's `NoiseBasedChunkGenerator.iterateNoiseColumn` makes on behalf of
     * `getBaseHeight`: the answer depends on the top of the column and nothing under it, so
     * everything below the match goes unsampled. The blocks above it are sampled in the same
     * order {@link ChunkSampler.column} uses, which is the order the aquifer expects.
     *
     * @param fromY - Where to start, for a caller whose dimension is shorter than the noise.
     *   Clamped to the top of the chunk.
     */
    public columnTop(
        x: number,
        z: number,
        accept: (state: string) => boolean,
        fromY: number = this.volume.maxBlockY
    ): number | undefined {
        for (let y = Math.min(fromY, this.volume.maxBlockY); y >= this.volume.minBlockY; y--) {
            const substance = this.aquifer.computeSubstance(x, y, z, this.density(x, y, z));
            if (accept(substance ?? this.defaultBlock)) return y;
        }

        return undefined;
    }

    /**
     * Visits every block of one interpolation cell, top slab first.
     *
     * A block is the same whichever order it is asked in, so this exists only to keep one
     * interpolation cell current for 128 consecutive samples instead of eight. Walking the
     * chunk column by column crosses a cell boundary every eight blocks and makes the density
     * stack refetch eight cell corners each time; walking it cell by cell crosses one per cell.
     *
     * @param cell - A cell index below {@link ChunkSampler.cellCount}. Indices run from the top
     *   of the dimension down, so a caller that stops early has filled the sky and not the
     *   bedrock.
     */
    public forEachCellBlock(
        cell: number,
        visit: (x: number, y: number, z: number, state: string, scheduleFluidUpdate: boolean) => void
    ): void {
        const cellZ = cell % this.cellsZ;
        const remainder = (cell - cellZ) / this.cellsZ;
        const cellX = remainder % this.cellsX;
        const cellY = this.cellsY - 1 - (remainder - cellX) / this.cellsX;

        const volume = this.volume;
        const originX = Math.floor(volume.minBlockX / this.cellSizeXz) + cellX;
        const originY = Math.floor(volume.minBlockY / this.cellSizeY) + cellY;
        const originZ = Math.floor(volume.minBlockZ / this.cellSizeXz) + cellZ;
        const firstX = Math.max(volume.minBlockX, originX * this.cellSizeXz);
        const lastX = Math.min(volume.maxBlockX, originX * this.cellSizeXz + this.cellSizeXz - 1);
        const firstY = Math.max(volume.minBlockY, originY * this.cellSizeY);
        const lastY = Math.min(volume.maxBlockY, originY * this.cellSizeY + this.cellSizeY - 1);
        const firstZ = Math.max(volume.minBlockZ, originZ * this.cellSizeXz);
        const lastZ = Math.min(volume.maxBlockZ, originZ * this.cellSizeXz + this.cellSizeXz - 1);

        const aquifer = this.aquifer;
        if (
            this.skipProvenCells &&
            this.context.beardifier === undefined &&
            this.isGlobalFluidOnlyCell(aquifer, firstY) &&
            this.interpolatedCellMaximum(firstX, lastX, firstY, lastY, firstZ, lastZ) <= 0
        ) {
            const blockCount = (lastX - firstX + 1) * (lastY - firstY + 1) * (lastZ - firstZ + 1);
            this.skippedCells++;
            this.skippedBlocks += blockCount;
            this.densityCallsSkipped += blockCount;
            this.aquiferCallsSkipped += blockCount;

            for (let x = firstX; x <= lastX; x++) {
                for (let z = firstZ; z <= lastZ; z++) {
                    for (let y = lastY; y >= firstY; y--) {
                        const state = this.fluidPicker(x, y, z).at(y);
                        if (this.verifySkippedCells) {
                            this.verifySkippedBlock(x, y, z, state, false, aquifer);
                        }
                        visit(x, y, z, state, false);
                    }
                }
            }
            return;
        }

        const cellSampleCount = (lastX - firstX + 1) * (lastY - firstY + 1) * (lastZ - firstZ + 1);
        if (this.volumeDensityEvaluator && cellSampleCount <= (this.volumeDensityValues?.length ?? 0)) {
            this.forEachVolumeCellBlock(firstX, lastX, firstY, lastY, firstZ, lastZ, aquifer, visit);
            return;
        }

        const walkingCellBefore = this.walkingCell;
        this.walkingCell = true;
        try {
            for (let x = firstX; x <= lastX; x++) {
                for (let z = firstZ; z <= lastZ; z++) {
                    for (let y = lastY; y >= firstY; y--) {
                        const substance = aquifer.computeSubstance(x, y, z, this.density(x, y, z));
                        visit(
                            x,
                            y,
                            z,
                            substance ?? this.defaultBlock,
                            substance !== undefined && substance !== AIR && this.aquifer.shouldScheduleFluidUpdate()
                        );
                    }
                }
            }
        } finally {
            this.walkingCell = walkingCellBefore;
        }
    }

    private forEachVolumeCellBlock(
        firstX: number,
        lastX: number,
        firstY: number,
        lastY: number,
        firstZ: number,
        lastZ: number,
        aquifer: Aquifer,
        visit: (x: number, y: number, z: number, state: string, scheduleFluidUpdate: boolean) => void
    ): void {
        const evaluator = this.volumeDensityEvaluator;
        const volume = this.volumeDensityBounds;
        const values = this.volumeDensityValues;
        if (evaluator === undefined || volume === undefined || values === undefined) {
            throw new Error('Volume density workspace is missing');
        }

        volume.minX = firstX;
        volume.minY = firstY;
        volume.minZ = firstZ;
        volume.sizeX = lastX - firstX + 1;
        volume.sizeY = lastY - firstY + 1;
        volume.sizeZ = lastZ - firstZ + 1;
        const bufferingBeforeSample = this.context.interpolationBuffersEnabled;
        this.context.interpolationBuffersEnabled = true;
        try {
            evaluator.sample(this.context, volume, values);
        } finally {
            this.context.interpolationBuffersEnabled = bufferingBeforeSample;
        }

        const planeSize = volume.sizeX * volume.sizeZ;
        for (let x = firstX; x <= lastX; x++) {
            for (let z = firstZ; z <= lastZ; z++) {
                for (let y = lastY; y >= firstY; y--) {
                    const index = (y - firstY) * planeSize + (z - firstZ) * volume.sizeX + (x - firstX);
                    const density = values[index] ?? 0;
                    const substance = aquifer.computeSubstance(x, y, z, density);
                    visit(
                        x,
                        y,
                        z,
                        substance ?? this.defaultBlock,
                        substance !== undefined && substance !== AIR && aquifer.shouldScheduleFluidUpdate()
                    );
                }
            }
        }
    }

    private isGlobalFluidOnlyCell(aquifer: Aquifer, firstY: number): boolean {
        if (this.randomState.settings.aquifers === undefined) return true;
        return aquifer instanceof NoiseBasedAquifer && aquifer.isGlobalFluidOnlyAt(firstY);
    }

    /** Returns the exact maximum of the supported interpolation cell, or NaN when unsupported. */
    private interpolatedCellMaximum(
        firstX: number,
        lastX: number,
        firstY: number,
        lastY: number,
        firstZ: number,
        lastZ: number
    ): number {
        const proof = this.interpolatedDensityProof;
        if (
            proof === undefined ||
            proof.cellSizeXz <= 0 ||
            proof.cellSizeY <= 0 ||
            proof.cellSizeXz !== this.cellSizeXz ||
            proof.cellSizeY !== this.cellSizeY ||
            proof.cellSizeXz * proof.cellSizeY * proof.cellSizeXz > 4096 ||
            Math.floor(firstX / proof.cellSizeXz) !== Math.floor(lastX / proof.cellSizeXz) ||
            Math.floor(firstY / proof.cellSizeY) !== Math.floor(lastY / proof.cellSizeY) ||
            Math.floor(firstZ / proof.cellSizeXz) !== Math.floor(lastZ / proof.cellSizeXz)
        ) {
            return Number.NaN;
        }

        return this.randomState.interpolatedCellMaximum(proof.node, this.context, firstX, firstY, firstZ) ?? Number.NaN;
    }

    private verifySkippedBlock(
        x: number,
        y: number,
        z: number,
        expectedState: string,
        expectedScheduleFluidUpdate: boolean,
        aquifer: Aquifer
    ): void {
        const bufferingBeforeSample = this.context.interpolationBuffersEnabled;
        this.context.interpolationBuffersEnabled = false;
        try {
            const density = this.finalDensity(this.context, x, y, z);
            if (density > 0) {
                throw new Error(`Skipped cell had positive scalar density ${density} at ${x},${y},${z}`);
            }

            const substance = aquifer.computeSubstance(x, y, z, density);
            const scalarState = substance ?? this.defaultBlock;
            const scalarScheduleFluidUpdate =
                substance !== undefined && substance !== AIR && aquifer.shouldScheduleFluidUpdate();
            if (scalarState !== expectedState || scalarScheduleFluidUpdate !== expectedScheduleFluidUpdate) {
                throw new Error(
                    `Skipped cell differed from scalar sampling at ${x},${y},${z}: ` +
                        `global=${expectedState}/${expectedScheduleFluidUpdate}, ` +
                        `scalar=${scalarState}/${scalarScheduleFluidUpdate}`
                );
            }
        } finally {
            this.context.interpolationBuffersEnabled = bufferingBeforeSample;
        }
    }

    /**
     * Generates one column from the top of the dimension down to its floor.
     *
     * @returns One entry per y level, ordered from `minBlockY` upward.
     */
    public column(x: number, z: number): ColumnBlock[] {
        const minY = this.volume.minBlockY;
        const height = this.volume.maxBlockY - minY + 1;
        const column: ColumnBlock[] = new Array(height);
        this.forEachColumnBlock(x, z, (y, state, scheduleFluidUpdate) => {
            column[y - minY] = { state, scheduleFluidUpdate };
        });
        return column;
    }

    /**
     * Generates every column of the chunk.
     *
     * @returns A 16 by 16 grid indexed as `[localZ][localX]`, each entry a column ordered from
     *   `minBlockY` upward.
     */
    public fill(): ColumnBlock[][][] {
        const grid: ColumnBlock[][][] = [];
        for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
            const row: ColumnBlock[][] = [];
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                row.push(this.column(this.volume.minBlockX + localX, this.volume.minBlockZ + localZ));
            }
            grid.push(row);
        }
        return grid;
    }

    /** How many cells of one size the extent `[min, max]` touches. */
    private cellSpan(min: number, max: number, size: number): number {
        return Math.floor(max / size) - Math.floor(min / size) + 1;
    }
}
