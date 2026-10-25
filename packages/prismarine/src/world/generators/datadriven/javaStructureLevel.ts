/**
 * The bare terrain a structure is laid out against.
 *
 * Java's `ChunkGenerator.getBaseHeight` and `getBaseColumn` answer from the noise alone: no
 * chunk is loaded, no surface rule has run and nothing has decorated. That is what lets a
 * village be laid out identically from any of the chunks it covers, and it is why a structure
 * never sees the grass the surface pass will put on top of the stone it settles onto.
 *
 * Sampling a column is one `final_density` evaluation per y level, so columns are memoized: a
 * village asks for the same few hundred of them while it grows, and a chunk's own neighbors ask
 * again.
 */
import type { BlockState, HeightmapType } from '@jsprismarine/features';
import type { NoiseGeneratorSettings, RandomState } from '@jsprismarine/worldgen';
import { ChunkSampler } from '@jsprismarine/worldgen';

import type { StructureLevel } from './javaStructureWorld';

/** How many sampled columns are kept before the cache is dropped and rebuilt. */
const COLUMN_LIMIT = 16384;

/** How many chunk samplers are kept, each of which carries its own aquifer. */
const SAMPLER_LIMIT = 256;

const AIR = 'minecraft:air';
const AIR_STATE: BlockState = { name: AIR, properties: {} };

/** How a {@link createNoiseStructureLevel} is built. */
export interface NoiseStructureLevelOptions {
    readonly randomState: RandomState;
    readonly settings: NoiseGeneratorSettings;
    /** The lowest y the dimension generates. */
    readonly minY: number;
    /** How many y levels the dimension generates. */
    readonly height: number;
    /** The biome source's answer at a quart position, with no fuzzing. */
    readonly noiseBiome: (quartX: number, quartY: number, quartZ: number) => string;
    /** Whether a state counts as solid, which is what the ocean floor heightmaps ask. */
    readonly isSolid: (state: BlockState) => boolean;
    /** Which fluid a state holds, which is what the motion blocking heightmap asks. */
    readonly isFluid: (state: BlockState) => boolean;
    /** Java's `Biome.coldEnoughToSnow`, which needs the biome registry rather than the noise. */
    readonly coldEnoughToSnow?: (x: number, y: number, z: number) => boolean;
}

/** The terrain seam over the noise generator, shared by every structure of one world. */
export const createNoiseStructureLevel = (options: NoiseStructureLevelOptions): StructureLevel => {
    const samplers = new Map<string, ChunkSampler>();
    const columns = new Map<string, readonly string[]>();
    const noiseMinY = options.settings.noiseSettings.minY;

    const samplerAt = (chunkX: number, chunkZ: number): ChunkSampler => {
        const key = `${chunkX},${chunkZ}`;
        const cached = samplers.get(key);
        if (cached !== undefined) return cached;

        if (samplers.size >= SAMPLER_LIMIT) samplers.clear();
        const sampler = new ChunkSampler(options.randomState, { chunkX, chunkZ });
        samplers.set(key, sampler);
        return sampler;
    };

    /** One column of Java identifiers, ordered from the noise floor upward. */
    const columnAt = (x: number, z: number): readonly string[] => {
        const key = `${x},${z}`;
        const cached = columns.get(key);
        if (cached !== undefined) return cached;

        const sampled = samplerAt(x >> 4, z >> 4)
            .column(x, z)
            .map((block) => block.state);
        if (columns.size >= COLUMN_LIMIT) columns.clear();
        columns.set(key, sampled);
        return sampled;
    };

    const stateAt = (x: number, y: number, z: number): BlockState => {
        const index = y - noiseMinY;
        const column = columnAt(x, z);
        const name = index < 0 || index >= column.length ? undefined : column[index];
        return name === undefined || name === AIR ? AIR_STATE : { name, properties: {} };
    };

    const matches = (heightmap: HeightmapType): ((state: BlockState) => boolean) => {
        switch (heightmap) {
            case 'WORLD_SURFACE':
            case 'WORLD_SURFACE_WG':
                return (state) => state.name !== AIR;
            case 'OCEAN_FLOOR':
            case 'OCEAN_FLOOR_WG':
                return options.isSolid;
            case 'MOTION_BLOCKING':
            case 'MOTION_BLOCKING_NO_LEAVES':
                // The noise stage places no leaves, so the two agree here.
                return (state) => options.isSolid(state) || options.isFluid(state);
        }
    };

    return {
        minY: options.minY,
        height: options.height,
        seaLevel: options.settings.seaLevel,
        baseHeight: (x, z, heightmap) => {
            const column = columnAt(x, z);
            const predicate = matches(heightmap);
            const top = Math.min(column.length - 1, options.minY + options.height - 1 - noiseMinY);
            for (let index = top; index >= 0; index--) {
                const name = column[index];
                if (name !== undefined && name !== AIR && predicate({ name, properties: {} })) {
                    return noiseMinY + index + 1;
                }
            }

            return options.minY;
        },
        baseBlock: stateAt,
        noiseBiome: options.noiseBiome,
        ...(options.coldEnoughToSnow === undefined ? {} : { coldEnoughToSnow: options.coldEnoughToSnow })
    };
};
