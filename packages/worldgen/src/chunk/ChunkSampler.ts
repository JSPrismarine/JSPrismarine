import type { DensitySampler } from '../density/compile';
import type { SampleContext } from '../density/SampleContext';
import type { RandomState } from '../RandomState';
import type { Aquifer, AquiferVolume } from './Aquifer';
import { createDisabledAquifer, createNoiseAquifer } from './Aquifer';
import type { FluidPicker } from './FluidPicker';
import { AIR, createGlobalFluidPicker, } from './FluidPicker';

/** The registry name the aquifer random factory is keyed by. */
export const AQUIFER_SEED = 'minecraft:aquifer';

/** The side length of a chunk column in blocks. */
export const CHUNK_SIZE = 16;

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
}

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
    /** The aquifer bound to this chunk, shared across every column in it. */
    public readonly aquifer: Aquifer;
    /** The per-chunk mutable state the compiled samplers read. */
    public readonly context: SampleContext;

    private readonly finalDensity: DensitySampler;
    private readonly defaultBlock: string;

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

        this.context = randomState.createContext();
        this.finalDensity = randomState.sampler(settings.noiseRouter.finalDensity);
        this.defaultBlock = settings.defaultBlock;

        const fluidPicker = options.fluidPicker ?? createGlobalFluidPicker(settings);
        this.aquifer = settings.aquifers
            ? createNoiseAquifer(
                  settings.aquifers,
                  (node) => randomState.sampler(node),
                  this.context,
                  randomState.randomFactory(AQUIFER_SEED),
                  this.volume,
                  fluidPicker
              )
            : createDisabledAquifer(fluidPicker);
    }

    /** The final density at one block position. */
    public density(x: number, y: number, z: number): number {
        return this.finalDensity(this.context, x, y, z);
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

    /**
     * Generates one column from the top of the dimension down to its floor.
     *
     * @returns One entry per y level, ordered from `minBlockY` upward.
     */
    public column(x: number, z: number): ColumnBlock[] {
        const minY = this.volume.minBlockY;
        const height = this.volume.maxBlockY - minY + 1;
        const column: ColumnBlock[] = new Array(height);
        for (let index = height - 1; index >= 0; index--) {
            column[index] = this.blockAt(x, minY + index, z);
        }
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
}
