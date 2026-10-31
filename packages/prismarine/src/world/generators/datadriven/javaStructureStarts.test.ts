/**
 * When the biome check runs, against a fake registry with one structure set in it.
 *
 * The order is the whole point of the file under test. Java's `Structure.generate` builds a
 * `GenerationStub` out of `findGenerationPoint`, filters it on the biome at the stub's position,
 * and only then runs the stub's consumer to assemble the pieces, so a structure drawn into a
 * biome that refuses it costs a generation point rather than a village. Reversing those two is
 * still correct and about five times slower, which is why it is asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest';

import { candidateChunksIn } from './javaStructurePlacement';
import type { StructureBuilder, StructureStartOptions } from './javaStructureStarts';
import { StructureStartSource } from './javaStructureStarts';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece } from './javaStructureWorld';
import type { JavaWorldgenRegistries } from './javaWorldgenData';

const SEED = 1234n;

/** The biome the fake level answers everywhere. */
const HERE = 'minecraft:plains';

/** A biome the dimension can produce somewhere else, so a set naming it is still loaded. */
const ELSEWHERE = 'minecraft:desert';

const EMPTY = new Map<string, unknown>();

/**
 * A registry set holding one structure, one set that offers it, and nothing else.
 *
 * @param sets - Further structure sets, by id, for a test about a placement the hut set is not.
 */
const registriesOf = (biomes: readonly string[], sets: Record<string, unknown> = {}): JavaWorldgenRegistries => ({
    densityFunctions: EMPTY,
    noises: EMPTY,
    noiseSettings: EMPTY,
    materialRules: EMPTY,
    materialConditions: EMPTY,
    carvers: EMPTY,
    biomes: EMPTY,
    features: EMPTY,
    placedFeatures: EMPTY,
    blockStateProviders: EMPTY,
    processorLists: EMPTY,
    structures: new Map<string, unknown>([['test:hut', { type: 'test:hut', biomes, step: 'surface_structures' }]]),
    structureSets: new Map<string, unknown>([
        [
            'test:huts',
            {
                placement: { type: 'minecraft:random_spread', spacing: 4, separation: 1, salt: 7 },
                structures: [{ structure: 'test:hut', weight: 1 }]
            }
        ],
        ...Object.entries(sets)
    ]),
    templatePools: EMPTY,
    dimensionTypes: EMPTY,
    dimensions: EMPTY,
    worldPresets: EMPTY,
    flatLevelGeneratorPresets: EMPTY,
    multiNoiseParameterLists: EMPTY,
    blockTags: EMPTY,
    biomeTags: EMPTY,
    structureTags: EMPTY,
    biomeParameters: EMPTY
});

/** Flat stone at y 64, one biome everywhere. */
const level: StructureLevel = {
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: () => 64,
    baseBlock: () => ({ name: 'minecraft:stone', properties: {} }),
    noiseBiome: () => HERE
};

const templates: StructureTemplateStore = {
    template: () => undefined,
    prepared: () => undefined,
    size: () => undefined,
    processors: () => [],
    javaBlockOf: () => undefined
};

/** One piece whose box is the start chunk's own column, which is enough to be a valid start. */
const pieceAt = (chunkX: number, chunkZ: number): StructurePiece => ({
    boundingBox: {
        minX: chunkX * 16,
        minY: 64,
        minZ: chunkZ * 16,
        maxX: chunkX * 16 + 15,
        maxY: 65,
        maxZ: chunkZ * 16 + 15
    },
    place: () => {}
});

/**
 * A source over the fake registries, asked for every candidate in one region.
 *
 * `startAt` is what `startsFor` calls per candidate, and asking it directly keeps the counts
 * free of the box-touches-chunk filter that decides which of those starts a chunk reads.
 */
const drawAll = (biomes: readonly string[], assemble: (chunkX: number, chunkZ: number) => StructurePiece[]) => {
    let points = 0;
    let assemblies = 0;

    const builder: StructureBuilder = (context) => {
        points++;
        return {
            origin: { x: context.chunkX * 16 + 8, y: 64, z: context.chunkZ * 16 + 8 },
            pieces: () => {
                assemblies++;
                return assemble(context.chunkX, context.chunkZ);
            }
        };
    };

    const options: StructureStartOptions = {
        seed: SEED,
        registries: registriesOf(biomes),
        level,
        templates,
        isPossibleBiome: (biome) => biome === HERE || biome === ELSEWHERE,
        builders: new Map([['test:hut', builder]])
    };

    const source = new StructureStartSource(options);
    const range = { minChunkX: 0, minChunkZ: 0, maxChunkX: 15, maxChunkZ: 15 };
    const kept = source
        .usedSets()
        .flatMap((named) =>
            candidateChunksIn(named.set.placement, SEED, range).map((at) => source.startAt(named, at.x, at.z))
        )
        .filter((start) => start !== null);

    return { kept, points, assemblies };
};

/** The spacing of the hut set, in chunks. */
const SPACING = 4;

/** A builder that starts at the chunk's middle and leaves one piece there. */
const hutBuilder: StructureBuilder = (context) => ({
    origin: { x: context.chunkX * 16 + 8, y: 64, z: context.chunkZ * 16 + 8 },
    pieces: () => [pieceAt(context.chunkX, context.chunkZ)]
});

/**
 * A source over the fake registries, with the biome accepting everywhere.
 *
 * @param extra - Further sets, by id, and the level to lay out against, for a test about a
 *   placement or a terrain the defaults are not.
 */
const sourceOf = (
    biomes: readonly string[] = [HERE],
    extra: { sets?: Record<string, unknown>; level?: StructureLevel } = {}
): StructureStartSource =>
    new StructureStartSource({
        seed: SEED,
        registries: registriesOf(biomes, extra.sets),
        level: extra.level ?? level,
        templates,
        isPossibleBiome: (biome) => biome === HERE || biome === ELSEWHERE,
        builders: new Map<string, StructureBuilder>([['test:hut', hutBuilder]])
    });

describe('StructureStartSource', () => {
    it('does not assemble a structure the biome at its generation point refuses', () => {
        const { kept, points, assemblies } = drawAll([ELSEWHERE], (x, z) => [pieceAt(x, z)]);

        expect(points).toBeGreaterThan(0);
        expect(kept).toEqual([]);
        expect(assemblies).toBe(0);
    });

    it('assembles a structure the biome accepts, once per candidate chunk', () => {
        const { kept, points, assemblies } = drawAll([HERE], (x, z) => [pieceAt(x, z)]);

        expect(kept.length).toBe(points);
        expect(assemblies).toBe(points);
        expect(kept.every((start) => start!.structure === 'test:hut')).toBe(true);
    });

    it('reports no start for a structure that assembles nothing, as Java does after the check', () => {
        const { kept, points, assemblies } = drawAll([HERE], () => []);

        expect(kept).toEqual([]);
        expect(assemblies).toBe(points);
    });

    it('caches each chunk result without changing candidate order', () => {
        let assemblies = 0;
        const source = new StructureStartSource({
            seed: SEED,
            registries: registriesOf([HERE]),
            level,
            templates,
            isPossibleBiome: (biome) => biome === HERE || biome === ELSEWHERE,
            builders: new Map<string, StructureBuilder>([
                [
                    'test:hut',
                    (context) => ({
                        origin: { x: context.chunkX * 16 + 8, y: 64, z: context.chunkZ * 16 + 8 },
                        pieces: () => {
                            assemblies++;
                            return [
                                {
                                    boundingBox: {
                                        minX: -10000,
                                        minY: 64,
                                        minZ: -10000,
                                        maxX: 10000,
                                        maxY: 65,
                                        maxZ: 10000
                                    },
                                    place: () => {}
                                }
                            ];
                        }
                    })
                ]
            ])
        });

        const expected = source
            .usedSets()
            .flatMap((named) =>
                candidateChunksIn(named.set.placement, SEED, {
                    minChunkX: -8,
                    minChunkZ: -8,
                    maxChunkX: 8,
                    maxChunkZ: 8
                }).map((candidate) => source.startAt(named, candidate.x, candidate.z))
            )
            .filter((start) => start !== null);

        const first = source.startsFor(0, 0);
        const second = source.startsFor(0, 0);

        expect(first).toEqual(expected);
        expect(second).toBe(first);
        expect(assemblies).toBe(expected.length);
    });

    describe('locate', () => {
        it('finds the nearest start to the origin, not whichever candidate came first', () => {
            const source = sourceOf();
            const origin = { originChunkX: 40, originChunkZ: 40, radius: 6 };

            const found = source.locate({ ...origin, wanted: (structure) => structure === 'test:hut' });
            expect(found).toBeDefined();

            // Nothing inside the radius may be closer to the origin than what was returned.
            const reach = origin.radius * SPACING;
            const distance = (chunkX: number, chunkZ: number): number =>
                (chunkX - origin.originChunkX) ** 2 + (chunkZ - origin.originChunkZ) ** 2;
            const nearest = source
                .usedSets()
                .flatMap((named) =>
                    candidateChunksIn(named.set.placement, SEED, {
                        minChunkX: origin.originChunkX - reach,
                        minChunkZ: origin.originChunkZ - reach,
                        maxChunkX: origin.originChunkX + reach,
                        maxChunkZ: origin.originChunkZ + reach
                    })
                )
                .map((at) => distance(at.x, at.z))
                .sort((left, right) => left - right)[0];

            expect(distance(found!.chunkX, found!.chunkZ)).toBe(nearest);
        });

        it('answers the generation point the layout settled on', () => {
            const found = sourceOf().locate({
                originChunkX: 0,
                originChunkZ: 0,
                radius: 4,
                wanted: () => true
            });

            expect(found?.origin).toEqual({ x: found!.chunkX * 16 + 8, y: 64, z: found!.chunkZ * 16 + 8 });
        });

        it('finds nothing when the predicate wants a structure this world does not place', () => {
            const found = sourceOf().locate({
                originChunkX: 0,
                originChunkZ: 0,
                radius: 8,
                wanted: (structure) => structure === 'test:mansion'
            });

            expect(found).toBe(undefined);
        });

        it('finds nothing when the biome refuses every candidate in range', () => {
            const found = sourceOf([ELSEWHERE]).locate({
                originChunkX: 0,
                originChunkZ: 0,
                radius: 8,
                wanted: () => true
            });

            expect(found).toBe(undefined);
        });

        it("searches the origin's own region when the radius is zero", () => {
            // Chunk (1, 1) lies in the region of chunks 0 to 3, which offers one candidate; a
            // radius of zero is that region and nothing beyond it.
            const found = sourceOf().locate({ originChunkX: 1, originChunkZ: 1, radius: 0, wanted: () => true });

            expect(found).toBeDefined();
            expect(found!.chunkX).toBeGreaterThanOrEqual(0);
            expect(found!.chunkX).toBeLessThan(SPACING);
            expect(found!.chunkZ).toBeGreaterThanOrEqual(0);
            expect(found!.chunkZ).toBeLessThan(SPACING);
        });

        it('lays out no more candidates than it has to, stopping at the first match', () => {
            let assemblies = 0;
            const source = new StructureStartSource({
                seed: SEED,
                registries: registriesOf([HERE]),
                level,
                templates,
                isPossibleBiome: (biome) => biome === HERE || biome === ELSEWHERE,
                builders: new Map<string, StructureBuilder>([
                    [
                        'test:hut',
                        (context) => ({
                            origin: { x: context.chunkX * 16 + 8, y: 64, z: context.chunkZ * 16 + 8 },
                            pieces: () => {
                                assemblies++;
                                return [pieceAt(context.chunkX, context.chunkZ)];
                            }
                        })
                    ]
                ])
            });

            // A radius of ten regions covers about 400 candidates. The nearest one matches, so
            // the scan must not walk the rest of them.
            source.locate({ originChunkX: 0, originChunkZ: 0, radius: 10, wanted: () => true });

            expect(assemblies).toBe(1);
        });

        it('measures the radius in placement regions, as Java does', () => {
            // The biome refuses everything west of chunk 8, which is the origin's region and
            // the next one. In chunks a radius of two would end at chunk 2; in regions of four
            // it reaches chunk 11 and the first candidate the biome allows.
            const source = sourceOf([HERE], {
                level: { ...level, noiseBiome: (quartX) => (quartX < 8 * 4 ? ELSEWHERE : HERE) }
            });
            const search = (radius: number) =>
                source.locate({ originChunkX: 0, originChunkZ: 0, radius, wanted: () => true });

            expect(search(1)).toBe(undefined);
            const found = search(2);
            expect(found).toBeDefined();
            expect(found!.chunkX).toBeGreaterThanOrEqual(8);
            expect(found!.chunkX).toBeLessThan(12);
        });

        it('reaches every ring of a concentric placement whatever the radius', () => {
            // Java's stronghold search walks all 128 ring positions, so the first ring, over a
            // hundred chunks out, is found from the origin with no radius at all. The hut set
            // is out of the way: at a radius of zero it offers only the origin's region, and the
            // biome refuses everything that near.
            const source = sourceOf([HERE], {
                sets: {
                    'test:rings': {
                        placement: {
                            type: 'minecraft:concentric_rings',
                            distance: 32,
                            spread: 3,
                            count: 128,
                            salt: 0
                        },
                        structures: [{ structure: 'test:hut', weight: 1 }]
                    }
                },
                level: {
                    ...level,
                    noiseBiome: (quartX, _quartY, quartZ) => (Math.hypot(quartX, quartZ) > 64 * 4 ? HERE : ELSEWHERE)
                }
            });

            const found = source.locate({ originChunkX: 0, originChunkZ: 0, radius: 0, wanted: () => true });

            expect(found?.set).toBe('test:rings');
            expect(Math.hypot(found!.chunkX, found!.chunkZ)).toBeGreaterThan(64);
        });

        it("answers Java's locate position: the chunk corner moved by the set's locate offset", () => {
            const source = sourceOf([HERE], {
                sets: {
                    'test:treasure': {
                        placement: {
                            type: 'minecraft:random_spread',
                            spacing: 4,
                            separation: 1,
                            salt: 11,
                            locate_offset: [9, 0, 9]
                        },
                        structures: [{ structure: 'test:hut', weight: 1 }]
                    }
                }
            });
            const firstStartOf = (id: string) =>
                source
                    .usedSets()
                    .filter((named) => named.id === id)
                    .flatMap((named) =>
                        candidateChunksIn(named.set.placement, SEED, {
                            minChunkX: -8,
                            minChunkZ: -8,
                            maxChunkX: 8,
                            maxChunkZ: 8
                        }).map((at) => source.startAt(named, at.x, at.z))
                    )
                    .find((start) => start !== null);

            const hut = firstStartOf('test:huts');
            const treasure = firstStartOf('test:treasure');

            expect(hut?.locatePosition).toEqual({ x: hut!.chunkX * 16, y: 0, z: hut!.chunkZ * 16 });
            expect(treasure?.locatePosition).toEqual({
                x: treasure!.chunkX * 16 + 9,
                y: 0,
                z: treasure!.chunkZ * 16 + 9
            });
        });
    });
});
