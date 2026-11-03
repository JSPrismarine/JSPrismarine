import { describe, expect, it } from 'vitest';

import biomeVectors from '../../vectors/biome-points.json' with { type: 'json' };
import tieVectors from '../../vectors/climate-ties.json' with { type: 'json' };
import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { BiomeManager } from './BiomeManager';
import type { BiomeResolver } from './BiomeSource';
import {
    CheckerboardBiomeSource,
    FixedBiomeSource,
    MultiNoiseBiomeSource,
    TheEndBiomeSource,
    memoizeBiomeResolver
} from './BiomeSource';
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

describe('climate lookups at exact ties', () => {
    // Two boxes can sit at the same distance from a target. Java keeps whichever one the thread
    // found last, so `climate-ties.json` records both the answer with no history and the answers
    // after each tied side was looked up first.
    const overworld = biomeVectors.parameterLists.find((list) => list.name === 'minecraft:overworld');
    if (!overworld) throw new Error('the vector file has no overworld parameter list');
    const entries = overworld.points.map((row) => unpack(row, overworld.biomes));
    const randomState = new RandomState(
        worldgenData,
        BigInt(tieVectors.seed),
        worldgenData.settings('minecraft:overworld')
    );

    it('is a case Java itself answers by history', () => {
        // Without this the rows below would pass for a list that never had a tie to break.
        for (const cell of tieVectors.cells) {
            expect(cell.tied.length).toBeGreaterThan(1);
            expect(new Set(cell.primed.map((entry) => entry.answer))).toEqual(new Set(cell.tied));
        }
    });

    it.each(tieVectors.cells)('samples the same climate as Java at quart $quart', (cell) => {
        const [quartX, quartY, quartZ] = cell.quart as [number, number, number];
        const target = createClimateSampler(randomState).sample(quartX, quartY, quartZ);
        expect(target).toEqual(targetOf(cell.target));
    });

    it.each(tieVectors.cells)('answers the lookup of a fresh Java thread at quart $quart', (cell) => {
        const target = targetOf(cell.target);
        expect(new ClimateParameterList(entries).find(target)).toBe(cell.fresh);
        expect(new ClimateParameterList(entries).findBruteForce(target)).toBeTypeOf('string');
    });

    it.each(tieVectors.cells)('ignores which tied side an earlier lookup landed on at quart $quart', (cell) => {
        const target = targetOf(cell.target);
        for (const side of cell.primed) {
            const parameters = new ClimateParameterList(entries);
            // The primer resolves to the tied biome, which is what leaves its box as the
            // starting candidate. Java's own answer to the next lookup follows that box.
            expect(parameters.find(targetOf(side.primer))).toBe(side.primedWith);
            expect(parameters.find(target)).toBe(cell.fresh);
        }
    });

    it('answers every lookup the same way whichever order the cells are visited in', () => {
        const sampler = createClimateSampler(randomState);
        const targets: ClimateTargetPoint[] = [];
        // The neighborhood of the tied cells, in column order as a chunk fill visits it.
        for (let quartX = 60; quartX < 70; quartX++) {
            for (let quartY = -16; quartY < 48; quartY += 4) {
                for (let quartZ = -190; quartZ < -182; quartZ++) {
                    targets.push(sampler.sample(quartX, quartY, quartZ));
                }
            }
        }

        // The two lists see opposite histories in front of every lookup.
        const forward = new ClimateParameterList(entries);
        const backward = new ClimateParameterList(entries);
        const forwardAnswers = targets.map((target) => forward.find(target));
        const backwardAnswers = [...targets].reverse().map((target) => backward.find(target));
        expect(forwardAnswers).toEqual(backwardAnswers.reverse());
        expect(targets.length).toBeGreaterThan(1000);
    });

    it('keeps the same tree order when the branching factor is small', () => {
        // A deeper tree reorders leaves, which moves the tied box that comes first. The answer
        // still has to be the same however the lookups before it went.
        for (const cell of tieVectors.cells) {
            const target = targetOf(cell.target);
            const answers = new Set<string>();
            for (const side of cell.primed) {
                const parameters = new ClimateParameterList(entries, 3);
                parameters.find(targetOf(side.primer));
                answers.add(parameters.find(target));
            }
            expect(answers.size).toBe(1);
        }
    });
});

describe('the flattened climate search tree', () => {
    it('keeps the stable tree order when climate centers repeat', () => {
        // Repeated centers and equal comparator keys exercise the stable tie order Java's tree uses.
        const entries: ClimateEntry<number>[] = Array.from({ length: 47 }, (_, index) => {
            const center = (axis: number): number => ((index * (axis + 3) + axis * 5) % 9) - 4;
            const span = (axis: number) => {
                const value = center(axis);
                const radius = (index + axis * 2) % 3;
                return { min: value - radius, max: value + radius };
            };
            return {
                value: index,
                point: {
                    temperature: span(0),
                    humidity: span(1),
                    continentalness: span(2),
                    erosion: span(3),
                    depth: span(4),
                    weirdness: span(5),
                    offset: center(6)
                }
            };
        });
        const parameters = new ClimateParameterList(entries);
        const targets = Array.from({ length: 21 }, (_, index) => {
            const coordinate = (axis: number): number => ((index * (axis + 1) + axis * 4) % 11) - 5;
            return {
                temperature: coordinate(0),
                humidity: coordinate(1),
                continentalness: coordinate(2),
                erosion: coordinate(3),
                depth: coordinate(4),
                weirdness: coordinate(5)
            };
        });

        expect(targets.map((target) => parameters.find(target))).toEqual([
            4, 7, 0, 7, 4, 0, 4, 4, 5, 8, 37, 4, 7, 0, 7, 4, 0, 4, 4, 5, 8
        ]);

        const sharedTree = parameters.toSharedTree();
        expect(sharedTree.bounds).toBeInstanceOf(SharedArrayBuffer);
        expect(sharedTree.children).toBeInstanceOf(SharedArrayBuffer);
        const forward = new ClimateParameterList(entries, undefined, sharedTree);
        const backward = new ClimateParameterList(entries, undefined, sharedTree);
        const forwardAnswers = targets.map((target) => forward.find(target));
        const backwardAnswers = [...targets].reverse().map((target) => backward.find(target));

        expect(forwardAnswers).toEqual(targets.map((target) => parameters.find(target)));
        expect(backwardAnswers.reverse()).toEqual(forwardAnswers);
    });

    it('matches a prior-result-seeded brute-force search for one million random targets', () => {
        const overworld = biomeVectors.parameterLists.find((list) => list.name === 'minecraft:overworld');
        if (overworld === undefined) throw new Error('the vector file has no overworld parameter list');

        const entries: ClimateEntry<number>[] = [];
        for (let index = 0; index < overworld.points.length; index += 128) {
            const row = overworld.points[index];
            if (row === undefined) throw new Error(`the overworld vector is missing point ${index}`);
            entries.push({ ...unpack(row, overworld.biomes), value: entries.length });
        }
        const parameters = new ClimateParameterList(entries);
        const indexOf = new Map(entries.map((entry, index) => [entry.value, index]));
        const target = {
            temperature: 0,
            humidity: 0,
            continentalness: 0,
            erosion: 0,
            depth: 0,
            weirdness: 0
        };
        let random = 0x37a4_19d3;
        const nextCoordinate = (): number => {
            random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
            return (random % 40_001) - 20_000;
        };
        let priorIndex = 0;
        const seededBruteForce = (candidateIndex: number): number => {
            const candidate = entries[candidateIndex];
            if (candidate === undefined) throw new Error(`missing prior climate candidate ${candidateIndex}`);
            let closestIndex = candidateIndex;
            let minimumDistance = climateFitness(candidate.point, target);
            for (let index = 0; index < entries.length; index++) {
                const entry = entries[index];
                if (entry === undefined) throw new Error(`missing climate entry ${index}`);
                const distance = climateFitness(entry.point, target);
                if (minimumDistance > distance) {
                    closestIndex = index;
                    minimumDistance = distance;
                }
            }
            return closestIndex;
        };

        for (let query = 0; query < 1_000_000; query++) {
            target.temperature = nextCoordinate();
            target.humidity = nextCoordinate();
            target.continentalness = nextCoordinate();
            target.erosion = nextCoordinate();
            target.depth = nextCoordinate();
            target.weirdness = nextCoordinate();

            // Seed the oracle from the prior leaf; compare distance so the stable tie policy can
            // select a different, equally near leaf than Java's history-dependent seed.
            const expectedIndex = seededBruteForce(priorIndex);
            const actual = parameters.find(target);
            const actualIndex = indexOf.get(actual);
            const expected = entries[expectedIndex];
            const found = actualIndex === undefined ? undefined : entries[actualIndex];
            if (actualIndex === undefined || expected === undefined || found === undefined) {
                throw new Error(`climate search returned an unknown leaf at query ${query}`);
            }
            if (climateFitness(found.point, target) !== climateFitness(expected.point, target)) {
                throw new Error(`climate search missed the seeded brute-force minimum at query ${query}`);
            }
            priorIndex = actualIndex;
        }
    }, 60_000);
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
    it('reuses y-independent climate parameters per quart column and keeps depth y-dependent', () => {
        const settings = worldgenData.settings('minecraft:overworld');
        const state = new RandomState(worldgenData, 1234n, settings);
        const context = state.createContext();
        const cached = createClimateSampler(state, context);
        const nodes = [
            settings.noiseRouter.temperature,
            settings.noiseRouter.vegetation,
            settings.noiseRouter.continents,
            settings.noiseRouter.erosion,
            settings.noiseRouter.depth,
            settings.noiseRouter.ridges
        ];
        const direct = nodes.map((node) => state.sampler(node));
        const depths = new Set<number>();

        for (const quartX of [-137, -65, -1, 0, 31, 63, 128]) {
            for (const quartZ of [-129, -3, 0, 29, 130]) {
                for (const quartY of [-32, 0, 24, 96]) {
                    const x = quartX * 4;
                    const y = quartY * 4;
                    const z = quartZ * 4;
                    const expected = climateTarget(
                        direct[0]?.(context, x, y, z) ?? 0,
                        direct[1]?.(context, x, y, z) ?? 0,
                        direct[2]?.(context, x, y, z) ?? 0,
                        direct[3]?.(context, x, y, z) ?? 0,
                        direct[4]?.(context, x, y, z) ?? 0,
                        direct[5]?.(context, x, y, z) ?? 0
                    );
                    expect(cached.sample(quartX, quartY, quartZ)).toEqual(expected);
                    if (quartX === 0 && quartZ === 0) depths.add(expected.depth);
                }
            }
        }

        expect(
            nodes.filter((node) => node !== settings.noiseRouter.depth).every((node) => state.isYIndependent(node))
        ).toBe(true);
        expect(state.isYIndependent(settings.noiseRouter.depth)).toBe(false);
        expect(depths.size).toBeGreaterThan(1);
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
        const resolve = source.resolver();
        expect(resolve(0, 0, 0)).toBe('minecraft:plains');
        expect(resolve(-1000, 4, 9999)).toBe('minecraft:plains');
        expect(source.possibleBiomes()).toEqual(['minecraft:plains']);
    });

    it('tiles its biomes into squares of the configured scale', () => {
        const source = new CheckerboardBiomeSource(['minecraft:plains', 'minecraft:desert'], 0);
        const resolve = source.resolver();
        expect(resolve(0, 0, 0)).toBe('minecraft:plains');
        expect(resolve(4, 0, 0)).toBe('minecraft:desert');
        expect(resolve(4, 0, 4)).toBe('minecraft:plains');
        expect(resolve(-4, 0, 0)).toBe('minecraft:desert');
    });
});

describe('the memoized biome resolver', () => {
    it('resolves a cell once and answers the rest from the cache', () => {
        const asked: string[] = [];
        const memoized = memoizeBiomeResolver((quartX, quartY, quartZ) => {
            asked.push(`${quartX},${quartY},${quartZ}`);
            return `biome:${quartX}.${quartY}.${quartZ}`;
        });

        expect(memoized(3, -4, 7)).toBe('biome:3.-4.7');
        expect(memoized(3, -4, 7)).toBe('biome:3.-4.7');
        expect(memoized(3, -4, 8)).toBe('biome:3.-4.8');
        expect(asked).toEqual(['3,-4,7', '3,-4,8']);
    });

    it('answers every cell of a chunk-sized walk the way the source would', () => {
        const source: BiomeResolver = (quartX, quartY, quartZ) => `biome:${(quartX * 31 + quartY * 17 + quartZ) % 7}`;
        const memoized = memoizeBiomeResolver(source);

        // Walked twice: the second pass reads only cached cells, including evicted ones.
        for (let pass = 0; pass < 2; pass++) {
            for (let quartX = -40; quartX < 40; quartX++) {
                for (let quartY = -16; quartY < 24; quartY++) {
                    for (let quartZ = -40; quartZ < 40; quartZ++) {
                        expect(memoized(quartX, quartY, quartZ)).toBe(source(quartX, quartY, quartZ));
                    }
                }
            }
        }
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

    it('matches the BigInt jitter oracle at randomized signed block positions', () => {
        const zoomSeed = BiomeManager.obfuscateSeed(123456789012345n);
        const resolver: BiomeResolver = (quartX, quartY, quartZ) => `${quartX},${quartY},${quartZ}`;
        const manager = new BiomeManager(resolver, zoomSeed);
        const multiplier = 6364136223846793005n;
        const increment = 1442695040888963407n;
        const lcgNext = (seed: bigint, value: bigint): bigint =>
            BigInt.asIntN(64, seed * BigInt.asIntN(64, seed * multiplier + increment) + value);
        const fiddle = (value: bigint): number => {
            const shifted = value >> 24n;
            const modulus = ((shifted % 1024n) + 1024n) % 1024n;
            return (Number(modulus) / 1024 - 0.5) * 0.9;
        };
        const offsetsAt = (cellX: number, cellY: number, cellZ: number): readonly [number, number, number] => {
            const x = BigInt(cellX);
            const y = BigInt(cellY);
            const z = BigInt(cellZ);
            let value = lcgNext(zoomSeed, x);
            value = lcgNext(value, y);
            value = lcgNext(value, z);
            value = lcgNext(value, x);
            value = lcgNext(value, y);
            value = lcgNext(value, z);
            const xOffset = fiddle(value);
            value = lcgNext(value, zoomSeed);
            const yOffset = fiddle(value);
            value = lcgNext(value, zoomSeed);
            return [xOffset, yOffset, fiddle(value)];
        };
        const expectedAt = (x: number, y: number, z: number): string => {
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
                const [jitterX, jitterY, jitterZ] = offsetsAt(
                    xEven ? parentX : parentX + 1,
                    yEven ? parentY : parentY + 1,
                    zEven ? parentZ : parentZ + 1
                );
                const dz = (zEven ? fractZ : fractZ - 1) + jitterZ;
                const dy = (yEven ? fractY : fractY - 1) + jitterY;
                const dx = (xEven ? fractX : fractX - 1) + jitterX;
                const distance = dz * dz + dy * dy + dx * dx;
                if (bestDistance > distance) {
                    bestCorner = corner;
                    bestDistance = distance;
                }
            }
            return (
                `${(bestCorner & 4) === 0 ? parentX : parentX + 1},` +
                `${(bestCorner & 2) === 0 ? parentY : parentY + 1},` +
                `${(bestCorner & 1) === 0 ? parentZ : parentZ + 1}`
            );
        };

        let state = 0x12345678;
        const next = (bound: number): number => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state % bound;
        };
        const positions = Array.from(
            { length: 1024 },
            () => [next(60_000_001) - 30_000_000, next(4096) - 2048, next(60_000_001) - 30_000_000] as const
        );
        // Exercise both sides of parent-cell boundaries in negative and positive coordinates.
        for (let parentX = -3; parentX <= 3; parentX++) {
            for (let parentY = -2; parentY <= 2; parentY++) {
                for (let parentZ = -3; parentZ <= 3; parentZ++) {
                    const boundaryX = parentX * 4 + 2;
                    const boundaryY = parentY * 4 + 2;
                    const boundaryZ = parentZ * 4 + 2;
                    positions.push(
                        [boundaryX - 1, boundaryY - 1, boundaryZ - 1],
                        [boundaryX, boundaryY, boundaryZ],
                        [boundaryX + 1, boundaryY + 1, boundaryZ + 1]
                    );
                }
            }
        }
        positions.push([-1, -64, -1], [0, 0, 0], [29_999_999, 319, -30_000_000]);
        for (const [x, y, z] of positions) expect(manager.getBiome(x, y, z)).toBe(expectedAt(x, y, z));
    });
});
