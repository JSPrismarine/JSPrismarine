import { describe, expect, it } from 'vitest';

import biomeVectors from '../../vectors/biome-points.json' with { type: 'json' };
import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { BiomeManager } from './BiomeManager';
import type { BiomeResolver } from './BiomeSource';
import { CheckerboardBiomeSource, FixedBiomeSource, MultiNoiseBiomeSource, TheEndBiomeSource } from './BiomeSource';
import type { ClimateEntry, ClimateTargetPoint } from './Climate';
import { ClimateParameterList, climateFitness, climateTarget, quantizeClimateCoord } from './Climate';
import type { ClimateSampler } from './ClimateSampler';
import { createClimateSampler } from './ClimateSampler';

/** The registry documents the dumper copied out of the jar, each one a compact JSON string. */
const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const worldgenData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

/** Reads one packed parameter point out of the vector file: a biome index then thirteen bounds. */
const unpack = (row: string, biomes: readonly string[]): ClimateEntry<string> => {
    const values = row.split(' ').map(Number);
    const at = (index: number): number => values[index] as number;
    const range = (index: number) => ({ min: at(index), max: at(index + 1) });
    return {
        point: {
            temperature: range(1),
            humidity: range(3),
            continentalness: range(5),
            erosion: range(7),
            depth: range(9),
            weirdness: range(11),
            offset: at(13)
        },
        value: biomes[at(0)] as string
    };
};

const targetOf = (values: readonly number[]): ClimateTargetPoint => ({
    temperature: values[0] as number,
    humidity: values[1] as number,
    continentalness: values[2] as number,
    erosion: values[3] as number,
    depth: values[4] as number,
    weirdness: values[5] as number
});

describe('climate quantization', () => {
    it('matches the float multiply and truncation Java applies', () => {
        for (const entry of biomeVectors.quantizeCoord) {
            expect(quantizeClimateCoord(entry.value)).toBe(entry.quantized);
        }
    });

    it('disagrees with the same arithmetic in double precision', () => {
        // 0.0003 lands on 3 through a float product and on 2 through a double one, which is the
        // kind of one-unit shift that moves a biome edge.
        const doubleQuantized = biomeVectors.quantizeCoord.map((entry) => Math.trunc(entry.value * 10000));
        expect(doubleQuantized).not.toEqual(biomeVectors.quantizeCoord.map((entry) => entry.quantized));
    });
});

describe.each(biomeVectors.parameterLists)('the $name climate parameter list', (list) => {
    const entries = list.points.map((row) => unpack(row, list.biomes));

    it('holds the biomes and points Java built', () => {
        expect(entries).toHaveLength(list.points.length);
        expect(new Set(entries.map((entry) => entry.value)).size).toBe(list.biomes.length);
    });

    it('returns the same biome as Java for every sampled target', () => {
        const parameters = new ClimateParameterList(entries);
        // Java seeds each query with the previous result, so the targets have to be replayed
        // in the order the dumper used.
        const found = list.lookups.map((lookup) => parameters.find(targetOf(lookup.target)));
        expect(found).toEqual(list.lookups.map((lookup) => lookup.tree));
    });

    it('agrees with a brute-force nearest-point scan', () => {
        const parameters = new ClimateParameterList(entries);
        for (const lookup of list.lookups) {
            expect(parameters.findBruteForce(targetOf(lookup.target))).toBe(lookup.bruteForce);
        }
    });

    it('returns the brute-force answer for a grid of targets the oracle did not visit', () => {
        const parameters = new ClimateParameterList(entries);
        for (let temperature = -10000; temperature <= 10000; temperature += 2500) {
            for (let continentalness = -10000; continentalness <= 10000; continentalness += 2500) {
                for (let weirdness = -10000; weirdness <= 10000; weirdness += 5000) {
                    const target = targetOf([temperature, 1500, continentalness, -2000, 500, weirdness]);
                    expect(parameters.find(target)).toBe(parameters.findBruteForce(target));
                }
            }
        }
    });

    it('finds an equally near box at a smaller branching factor', () => {
        // The branching factor changes which box wins a tie, not how near the winner is, so
        // this compares the distance rather than the biome.
        const wide = new ClimateParameterList(entries);
        const narrow = new ClimateParameterList(entries, 3);
        const nearest = (target: ClimateTargetPoint): number =>
            Math.min(...entries.map((entry) => climateFitness(entry.point, target)));
        for (const lookup of list.lookups) {
            const target = targetOf(lookup.target);
            const found = narrow.find(target);
            const fitness = Math.min(
                ...entries.filter((entry) => entry.value === found).map((entry) => climateFitness(entry.point, target))
            );
            expect(fitness).toBe(nearest(target));
            expect(wide.findBruteForce(target)).toBeTypeOf('string');
        }
    });
});

describe('the multi-noise biome source', () => {
    const nether = biomeVectors.parameterLists.find((list) => list.name === 'minecraft:nether');
    if (!nether) throw new Error('the vector file has no nether parameter list');
    const source = new MultiNoiseBiomeSource(
        new ClimateParameterList(nether.points.map((row) => unpack(row, nether.biomes)))
    );

    it('lists every biome its boxes name', () => {
        expect([...source.possibleBiomes()].sort()).toEqual([...nether.biomes].sort());
    });

    it('resolves a cell through the climate sampler', () => {
        const sampler: ClimateSampler = {
            sample: () => climateTarget(0.4, 0, 0, 0, 0, 0),
            erosion: () => 0
        };
        expect(source.resolver(sampler)(0, 0, 0)).toBe('minecraft:crimson_forest');
    });
});

describe('the end biome source', () => {
    const erosionByPosition = new Map<string, number>();
    const sampler: ClimateSampler = {
        sample: () => climateTarget(0, 0, 0, 0, 0, 0),
        erosion: (x, y, z) => erosionByPosition.get(`${x},${y},${z}`) ?? 0
    };
    const resolve = new TheEndBiomeSource().resolver(sampler);

    it('places the central island inside 64 chunks of the origin', () => {
        expect(resolve(0, 16, 0)).toBe('minecraft:the_end');
        expect(resolve(255, 16, 0)).toBe('minecraft:the_end');
    });

    it('splits the outer islands on the four erosion thresholds', () => {
        const quartX = 1000;
        const quartZ = 0;
        const key = `${((quartX << 2) >> 4) * 2 * 8 + 8},${16 << 2},8`;
        const expectations: [number, string][] = [
            [0.5, 'minecraft:end_highlands'],
            [0, 'minecraft:end_midlands'],
            [-0.1, 'minecraft:end_barrens'],
            [-0.5, 'minecraft:small_end_islands']
        ];
        for (const [erosion, biome] of expectations) {
            erosionByPosition.set(key, erosion);
            expect(resolve(quartX, 16, quartZ)).toBe(biome);
        }
    });

    it('matches Java over the sampled grid, driven by the real end noise router', () => {
        const settings = worldgenData.settings('minecraft:end');
        const randomState = new RandomState(worldgenData, BigInt(biomeVectors.seed), settings);
        const resolve = new TheEndBiomeSource().resolver(createClimateSampler(randomState));
        const found = biomeVectors.end.map((entry) => {
            const [quartX, quartY, quartZ] = entry.quart as [number, number, number];
            return resolve(quartX, quartY, quartZ);
        });
        expect(found).toEqual(biomeVectors.end.map((entry) => entry.biome));
        expect(new Set(found).size).toBe(5);
    }, 60_000);
});

describe('the fixed and checkerboard biome sources', () => {
    it('answers with one biome everywhere', () => {
        const source = new FixedBiomeSource('minecraft:plains');
        const resolve = source.resolver({} as unknown as ClimateSampler);
        expect(resolve(0, 0, 0)).toBe('minecraft:plains');
        expect(resolve(-1000, 4, 9999)).toBe('minecraft:plains');
        expect(source.possibleBiomes()).toEqual(['minecraft:plains']);
    });

    it('tiles its biomes into squares of the configured scale', () => {
        const source = new CheckerboardBiomeSource(['minecraft:plains', 'minecraft:desert'], 0);
        const resolve = source.resolver({} as unknown as ClimateSampler);
        expect(resolve(0, 0, 0)).toBe('minecraft:plains');
        expect(resolve(4, 0, 0)).toBe('minecraft:desert');
        expect(resolve(4, 0, 4)).toBe('minecraft:plains');
        expect(resolve(-4, 0, 0)).toBe('minecraft:desert');
    });
});

describe('the biome manager', () => {
    it('derives the jitter seed the way Java hashes a world seed', () => {
        for (const entry of biomeVectors.obfuscateSeed) {
            expect(BiomeManager.obfuscateSeed(BigInt(entry.seed)).toString()).toBe(entry.obfuscated);
        }
    });

    it('picks the same jittered cell as Java for every sampled block', () => {
        const zoomSeed = BiomeManager.obfuscateSeed(BigInt(biomeVectors.seed));
        for (const entry of biomeVectors.biomeZoom) {
            let chosen: number[] = [];
            const resolver: BiomeResolver = (quartX, quartY, quartZ) => {
                chosen = [quartX, quartY, quartZ];
                return 'minecraft:plains';
            };
            const [x, y, z] = entry.block as [number, number, number];
            new BiomeManager(resolver, zoomSeed).getBiome(x, y, z);
            expect(chosen).toEqual(entry.quart);
        }
    });
});
