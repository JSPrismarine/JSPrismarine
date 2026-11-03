import { describe, expect, it } from 'vitest';

import biomeVectors from '../../vectors/biome-points.json' with { type: 'json' };
import carverBiomeVectors from '../../vectors/carver-biomes.json' with { type: 'json' };
import carverVectors from '../../vectors/surface-carver.json' with { type: 'json' };
import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { BiomeManager } from '../biome/BiomeManager';
import type { BiomeResolver } from '../biome/BiomeSource';
import { MultiNoiseBiomeSource } from '../biome/BiomeSource';
import { ClimateParameterList } from '../biome/Climate';
import { createClimateSampler } from '../biome/ClimateSampler';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import type { WorldGenerationContext } from '../surface/VerticalAnchor';
import type { CarverConfig } from './Carver';
import { carveChunk, carversFromNoiseBiome, isStartChunk, largeFeatureRandom, parseCarver } from './Carver';
import { CarvingMask } from './CarvingMask';

const SEED = BigInt(carverVectors.seed);

const context: WorldGenerationContext = {
    minGenY: carverVectors.minY,
    genDepth: carverVectors.height,
    seaLevel: 63
};

const carvers = new Map<string, CarverConfig>(
    Object.entries(registryVectors.carvers).map(([id, document]) => [
        id,
        // Each value is a `worldgen/carver` document the dumper re-serialized onto one line.
        parseCarver(JSON.parse(document) as unknown, id)
    ])
);

const carverNamed = (id: string): CarverConfig => {
    const config = carvers.get(id);
    if (!config) throw new Error(`the vector file has no ${id} carver`);
    return config;
};

/** Runs one carver over every source chunk around a target chunk, as a generator would. */
const carve = (config: CarverConfig, chunkX: number, chunkZ: number, seed = SEED): CarvingMask => {
    const output = CarvingMask.forChunk(context);
    carveChunk({ seed, chunkX, chunkZ, carversAt: () => [config], context, output });
    return output;
};

describe('the carver registry', () => {
    it('parses all four carvers the 26.3 data holds', () => {
        expect([...carvers.keys()].sort()).toEqual([
            'minecraft:canyon',
            'minecraft:cave',
            'minecraft:cave_extra_underground',
            'minecraft:nether_cave'
        ]);
        expect(carverNamed('minecraft:cave').type).toBe('cave');
        expect(carverNamed('minecraft:canyon').type).toBe('canyon');
    });

    it('reads the 26.3 flattened shape rather than the 1.21 config object', () => {
        const cave = carverNamed('minecraft:cave');
        if (cave.type !== 'cave') throw new Error('expected a cave carver');
        expect(cave.probability).toBeCloseTo(0.15, 6);
        expect(cave.weirdThicknessBias).toBe(true);
        expect(cave.count).toEqual({ type: 'very_biased_to_bottom', minInclusive: 0, maxInclusive: 14 });
    });

    it('rejects an unknown carver type', () => {
        expect(() => parseCarver({ type: 'minecraft:invented' })).toThrow(/unknown carver type/);
    });
});

describe.each(carverVectors.cases)('the $carver carver against Java', (testCase) => {
    const config = carverNamed(testCase.carver);

    for (const chunk of testCase.chunks) {
        it(`opens exactly the blocks Java opens in chunk ${chunk.chunkX},${chunk.chunkZ}`, () => {
            const mask = carve(config, chunk.chunkX, chunk.chunkZ);
            const segments: number[][] = [];
            mask.visit((localX, localZ, bottomY, topY) => segments.push([localX, localZ, bottomY, topY]));
            expect(segments).toEqual(chunk.segments);
        }, 60_000);

        it(`starts in the same source chunks as Java for ${chunk.chunkX},${chunk.chunkZ}`, () => {
            const starts: number[][] = [];
            for (let dx = -8; dx <= 8; dx++) {
                for (let dz = -8; dz <= 8; dz++) {
                    const sourceX = chunk.chunkX + dx;
                    const sourceZ = chunk.chunkZ + dz;
                    if (isStartChunk(config, largeFeatureRandom(SEED, sourceX, sourceZ))) {
                        starts.push([sourceX, sourceZ]);
                    }
                }
            }
            expect(starts).toEqual(chunk.starts);
        });
    }
});

describe('carver determinism and distribution, which cannot be compared with Bedrock Edition', () => {
    // Bedrock's generator is undocumented, so a carver path can only be asserted against Java
    // Edition. These two tests cover the properties that hold regardless of edition.
    const cave = carverNamed('minecraft:cave');

    it('opens the same blocks twice for one seed and chunk', () => {
        const first = carve(cave, 3, -5);
        const second = carve(cave, 3, -5);
        expect(second.carvedCount).toBe(first.carvedCount);
        for (let y = context.minGenY + 1; y <= context.minGenY + 32; y++) {
            for (let localX = 0; localX < 16; localX++) {
                expect(second.isCarved(localX, y, 0)).toBe(first.isCarved(localX, y, 0));
            }
        }
    }, 60_000);

    it('opens a different set of blocks for a different seed', () => {
        const base = carve(cave, 3, -5);
        const other = carve(cave, 3, -5, 987654321n);
        expect(other.carvedCount).not.toBe(base.carvedCount);
    }, 60_000);

    it('opens between 0.2 and 5 percent of a chunk on average over sixteen chunks', () => {
        // Measured once against this implementation and then pinned, which is what the parity
        // note asks for in place of a cross-edition comparison.
        const volumes: number[] = [];
        for (let chunkX = 0; chunkX < 4; chunkX++) {
            for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
                volumes.push(carve(cave, chunkX, chunkZ).carvedCount);
            }
        }
        const total = volumes.reduce((sum, value) => sum + value, 0);
        const blocksPerChunk = 256 * (context.genDepth - 8);
        const fraction = total / (volumes.length * blocksPerChunk);
        expect(fraction).toBeGreaterThan(0.002);
        expect(fraction).toBeLessThan(0.05);
        expect(volumes.filter((volume) => volume > 0).length).toBeGreaterThanOrEqual(12);
    }, 120_000);
});

describe('the carving mask', () => {
    it('reports one run per column of open blocks', () => {
        const mask = new CarvingMask(-64, 319);
        mask.carve(2, 10, 3);
        mask.carve(2, 11, 3);
        mask.carve(2, 13, 3);
        const segments: number[][] = [];
        mask.visit((localX, localZ, bottomY, topY) => segments.push([localX, localZ, bottomY, topY]));
        expect(segments).toEqual([
            [2, 3, 10, 11],
            [2, 3, 13, 13]
        ]);
    });

    it('spans the dimension minus the protected blocks at the top', () => {
        const mask = CarvingMask.forChunk(context);
        expect(mask.minY).toBe(carverVectors.minY + 1);
        expect(mask.maxY).toBe(carverVectors.minY + carverVectors.height - 8);
        expect(mask.isEmpty()).toBe(true);
    });
});

describe('carver selection from the noise biome', () => {
    const cave = carverNamed('minecraft:cave');
    const canyon = carverNamed('minecraft:canyon');
    const carversOf = (biome: string): readonly CarverConfig[] => (biome === 'test:east' ? [canyon] : [cave]);

    // The biome border runs along the cell column x = 0: everything west of it is `test:west`.
    const border: BiomeResolver = (quartX) => (quartX < 0 ? 'test:west' : 'test:east');

    it('reads the cell holding the source chunk corner, at quart height zero', () => {
        const asked: number[][] = [];
        const carversAt = carversFromNoiseBiome((quartX, quartY, quartZ) => {
            asked.push([quartX, quartY, quartZ]);
            return 'test:west';
        }, carversOf);

        carversAt(3, -5);
        carversAt(-1, 0);

        // Java: `getNoiseBiome(QuartPos.fromBlock(minBlockX), 0, QuartPos.fromBlock(minBlockZ))`.
        expect(asked).toEqual([
            [12, 0, -20],
            [-4, 0, 0]
        ]);
    });

    it('selects the carvers of the biome on each side of a border', () => {
        const carversAt = carversFromNoiseBiome(border, carversOf);

        expect(carversAt(-1, 7)).toEqual([cave]);
        expect(carversAt(0, 7)).toEqual([canyon]);
        expect(carversAt(25, -3)).toEqual([canyon]);
    });

    it('differs from the jittered lookup, which moves the border by up to a cell', () => {
        // This is the old behavior: `BiomeManager.getBiome` at the chunk corner and height 0.
        const manager = new BiomeManager(border, BiomeManager.obfuscateSeed(1234n));
        const carversAt = carversFromNoiseBiome(border, carversOf);

        let disagreements = 0;
        for (let chunkZ = -64; chunkZ < 64; chunkZ++) {
            // Chunk 0 is the first chunk east of the border; the cell west of it is x = -1.
            const jittered = manager.getBiome(0, 0, chunkZ * 16);
            if (carversOf(jittered)[0] !== carversAt(0, chunkZ)[0]) disagreements++;
        }

        expect(disagreements).toBeGreaterThan(0);
    });
});

describe('carver selection against the overworld Java generates', () => {
    const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
        new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));
    const data = new WorldgenData({
        densityFunctions: parseDocuments(registryVectors.densityFunctions),
        noises: parseDocuments(registryVectors.noises),
        noiseSettings: parseDocuments(registryVectors.noiseSettings)
    });
    const overworld = biomeVectors.parameterLists.find((list) => list.name === 'minecraft:overworld');
    if (!overworld) throw new Error('the vector file has no overworld parameter list');
    const source = new MultiNoiseBiomeSource(
        new ClimateParameterList(
            overworld.points.map((row) => {
                const values = row.split(' ').map(Number);
                const range = (index: number) => ({ min: values[index] as number, max: values[index + 1] as number });
                return {
                    point: {
                        temperature: range(1),
                        humidity: range(3),
                        continentalness: range(5),
                        erosion: range(7),
                        depth: range(9),
                        weirdness: range(11),
                        offset: values[13] as number
                    },
                    value: overworld.biomes[values[0] as number] as string
                };
            })
        )
    );
    const seed = BigInt(carverBiomeVectors.seed);
    const noiseBiome = source.resolver(
        createClimateSampler(new RandomState(data, seed, data.settings('minecraft:overworld')))
    );
    const manager = new BiomeManager(noiseBiome, BiomeManager.obfuscateSeed(seed));

    const chunks: {
        readonly chunkX: number;
        readonly chunkZ: number;
        readonly noise: string;
        readonly jittered: string;
    }[] = [];
    carverBiomeVectors.noise.forEach((noise, index) => {
        chunks.push({
            chunkX: carverBiomeVectors.firstChunk + Math.floor(index / carverBiomeVectors.chunks),
            chunkZ: carverBiomeVectors.firstChunk + (index % carverBiomeVectors.chunks),
            noise: carverBiomeVectors.biomes[noise] as string,
            jittered: carverBiomeVectors.biomes[carverBiomeVectors.jittered[index] as number] as string
        });
    });

    it('reads the same noise biome as Java for every source chunk of a 48 by 48 window', () => {
        // Each chunk's carvers come from the biome this returns, so the biome is what is compared.
        const asked: string[] = [];
        const carversAt = carversFromNoiseBiome(noiseBiome, (biome) => {
            asked.push(biome);
            return [];
        });
        for (const chunk of chunks) carversAt(chunk.chunkX, chunk.chunkZ);

        expect(asked).toEqual(chunks.map((chunk) => chunk.noise));
    }, 120_000);

    it('differs from the jittered biome Java would give at the same corner for some chunks', () => {
        // The window has chunks where the two biomes differ, so reading the jittered one picks
        // the wrong biome there. `BiomeManager` itself matches Java at those corners.
        const moved = chunks.filter((chunk) => chunk.noise !== chunk.jittered);
        expect(moved.length).toBeGreaterThan(0);
        for (const chunk of moved) {
            expect(manager.getBiome(chunk.chunkX * 16, 0, chunk.chunkZ * 16)).toBe(chunk.jittered);
        }
    }, 120_000);
});
