import { normalizeIdentifier } from '../identifier';
import { floorMod, quartToBlock } from '../math';
import type { ClimateEntry } from './Climate';
import { ClimateParameterList, parseClimateParameterPoint } from './Climate';
import type { ClimateSampler } from './ClimateSampler';

/** Returns the biome identifier of one biome cell. */
export type BiomeResolver = (quartX: number, quartY: number, quartZ: number) => string;

/**
 * How many biome cells a memoized resolver remembers.
 *
 * A chunk spans 1536 cells and the surface pass reaches into its neighbors, so a 3 by 3 region
 * of chunks works in about 14000. Rounding that up to a power of two keeps the whole working
 * set resident and the slot index a mask away.
 */
const BIOME_CELL_SLOTS = 1 << 15;

/**
 * Wraps a resolver so each biome cell is resolved once.
 *
 * Java never asks a biome source the same cell twice: `createBiomes` fills the chunk's biome
 * array, and every later stage reads that array. This server's stages call the source directly,
 * and the surface pass calls it per block, which made a multi-noise lookup, six density
 * functions and all their noise octaves run 98304 times per chunk for 1536 distinct answers.
 *
 * The cache is direct-mapped: a cell hashes to one slot and a colliding cell evicts the
 * previous occupant. The stored coordinates are compared exactly before a value is reused, so
 * an eviction costs a recomputation and never an answer.
 */
export const memoizeBiomeResolver = (resolver: BiomeResolver): BiomeResolver => {
    const keyX = new Int32Array(BIOME_CELL_SLOTS);
    const keyY = new Int32Array(BIOME_CELL_SLOTS);
    const keyZ = new Int32Array(BIOME_CELL_SLOTS);
    const filled = new Uint8Array(BIOME_CELL_SLOTS);
    const values = new Array<string>(BIOME_CELL_SLOTS);

    return (quartX, quartY, quartZ) => {
        // Three 32-bit multiplicative hashes, folded; the constants are odd and well-mixed.
        const slot =
            (Math.imul(quartX, -1640531527) ^ Math.imul(quartY, -2048144789) ^ Math.imul(quartZ, -1028477379)) &
            (BIOME_CELL_SLOTS - 1);
        if (filled[slot] === 1 && keyX[slot] === quartX && keyY[slot] === quartY && keyZ[slot] === quartZ) {
            return values[slot] as string;
        }

        const biome = resolver(quartX, quartY, quartZ);
        keyX[slot] = quartX;
        keyY[slot] = quartY;
        keyZ[slot] = quartZ;
        values[slot] = biome;
        filled[slot] = 1;
        return biome;
    };
};

/**
 * A dimension's biome layout.
 *
 * A source is immutable and seed-independent; binding it to a {@link ClimateSampler} through
 * {@link BiomeSource.resolver} is what ties it to a world.
 */
export interface BiomeSource {
    /** Every biome this source can produce, which the surface pass uses to prune rules. */
    possibleBiomes(): readonly string[];
    /** Binds the source to one world's climate functions. */
    resolver(sampler: ClimateSampler): BiomeResolver;
}

/** A biome source that answers with the same biome everywhere. */
export class FixedBiomeSource implements BiomeSource {
    public constructor(
        /** The biome identifier every cell resolves to. */
        public readonly biome: string
    ) {}

    /** @inheritDoc */
    public possibleBiomes(): readonly string[] {
        return [this.biome];
    }

    /** @inheritDoc */
    public resolver(): BiomeResolver {
        return () => this.biome;
    }
}

/**
 * A biome source that tiles its biomes into square columns, which is what the `checkerboard`
 * world preset uses for debugging.
 */
export class CheckerboardBiomeSource implements BiomeSource {
    private readonly bitShift: number;

    public constructor(
        /** The biomes, cycled in order. */
        public readonly biomes: readonly string[],
        /** The square size, as a power of two in biome cells; Java's default is 2. */
        public readonly scale = 2
    ) {
        if (biomes.length === 0) throw new RangeError('A checkerboard biome source needs at least one biome');
        this.bitShift = scale + 2;
    }

    /** @inheritDoc */
    public possibleBiomes(): readonly string[] {
        return this.biomes;
    }

    /** @inheritDoc */
    public resolver(): BiomeResolver {
        return (quartX, _quartY, quartZ) =>
            this.biomes[floorMod((quartX >> this.bitShift) + (quartZ >> this.bitShift), this.biomes.length)] as string;
    }
}

/**
 * The climate-driven biome source every vanilla overworld and nether uses.
 *
 * Each biome owns one or more boxes in seven-dimensional climate space, and a cell takes the
 * biome of the nearest box. The vanilla overworld list holds 7594 boxes over 56 biomes, which
 * is why the lookup goes through {@link ClimateParameterList}'s search tree.
 */
export class MultiNoiseBiomeSource implements BiomeSource {
    public constructor(
        /** The boxes and the biome each claims. */
        public readonly parameters: ClimateParameterList<string>
    ) {}

    /**
     * Reads a `worldgen/multi_noise_biome_source_parameter_list` document, or the `biomes` list
     * a `multi_noise` biome source carries inline.
     *
     * @throws When an entry is missing its `biome` or `parameters` field.
     */
    public static fromJson(source: unknown, path = '<multi_noise>'): MultiNoiseBiomeSource {
        const list = Array.isArray(source)
            ? source
            : (() => {
                  if (typeof source !== 'object' || source === null) {
                      throw new TypeError(`${path}: expected an object or an array`);
                  }
                  // A parsed JSON document is `unknown`; the field is checked right after.
                  const biomes = (source as Record<string, unknown>)['biomes'];
                  if (!Array.isArray(biomes)) throw new TypeError(`${path}.biomes: expected an array`);
                  return biomes;
              })();

        const entries: ClimateEntry<string>[] = list.map((raw, index) => {
            const entryPath = `${path}[${index}]`;
            if (typeof raw !== 'object' || raw === null) throw new TypeError(`${entryPath}: expected an object`);
            // A parsed JSON document is `unknown`; both fields are checked by their parsers.
            const entry = raw as Record<string, unknown>;
            return {
                point: parseClimateParameterPoint(entry['parameters'], `${entryPath}.parameters`),
                value: normalizeIdentifier(entry['biome'])
            };
        });
        return new MultiNoiseBiomeSource(new ClimateParameterList(entries));
    }

    /** @inheritDoc */
    public possibleBiomes(): readonly string[] {
        return [...new Set(this.parameters.entries.map((entry) => entry.value))];
    }

    /** @inheritDoc */
    public resolver(sampler: ClimateSampler): BiomeResolver {
        return (quartX, quartY, quartZ) => this.parameters.find(sampler.sample(quartX, quartY, quartZ));
    }
}

/** The five biomes the end places, in the order {@link TheEndBiomeSource} reports them. */
export const END_BIOMES = [
    'minecraft:the_end',
    'minecraft:end_highlands',
    'minecraft:end_midlands',
    'minecraft:small_end_islands',
    'minecraft:end_barrens'
] as const;

/**
 * The end's biome layout, which is four erosion thresholds around a central island rather than
 * a climate lookup.
 *
 * Everything within 64 chunks of the origin is the central island. Outside it the erosion
 * function, sampled at the middle of the containing chunk, picks between the four outer
 * biomes.
 */
export class TheEndBiomeSource implements BiomeSource {
    /** @inheritDoc */
    public possibleBiomes(): readonly string[] {
        return END_BIOMES;
    }

    /** @inheritDoc */
    public resolver(sampler: ClimateSampler): BiomeResolver {
        return (quartX, quartY, quartZ) => {
            const blockX = quartToBlock(quartX);
            const blockY = quartToBlock(quartY);
            const blockZ = quartToBlock(quartZ);
            const chunkX = blockX >> 4;
            const chunkZ = blockZ >> 4;
            if (chunkX * chunkX + chunkZ * chunkZ <= 4096) return 'minecraft:the_end';

            const sampleX = (chunkX * 2 + 1) * 8;
            const sampleZ = (chunkZ * 2 + 1) * 8;
            const height = sampler.erosion(sampleX, blockY, sampleZ);
            if (height > 0.25) return 'minecraft:end_highlands';
            if (height >= -0.0625) return 'minecraft:end_midlands';
            return height < -0.21875 ? 'minecraft:small_end_islands' : 'minecraft:end_barrens';
        };
    }
}
