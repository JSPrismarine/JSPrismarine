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

/** A registry set holding one structure, one set that offers it, and nothing else. */
const registriesOf = (biomes: readonly string[]): JavaWorldgenRegistries => ({
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
        ]
    ]),
    templatePools: EMPTY,
    blockTags: EMPTY,
    biomeTags: EMPTY,
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

/** A source over the fake registries, with the biome accepting everywhere. */
const sourceOf = (biomes: readonly string[] = [HERE]): StructureStartSource =>
    new StructureStartSource({
        seed: SEED,
        registries: registriesOf(biomes),
        level,
        templates,
        isPossibleBiome: (biome) => biome === HERE || biome === ELSEWHERE,
        builders: new Map<string, StructureBuilder>([
            [
                'test:hut',
                (context) => ({
                    origin: { x: context.chunkX * 16 + 8, y: 64, z: context.chunkZ * 16 + 8 },
                    pieces: () => [pieceAt(context.chunkX, context.chunkZ)]
                })
            ]
        ])
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
            const origin = { originChunkX: 40, originChunkZ: 40, radiusInChunks: 24 };

            const found = source.locate({ ...origin, wanted: (structure) => structure === 'test:hut' });
            expect(found).toBeDefined();

            // Nothing inside the radius may be closer to the origin than what was returned.
            const distance = (chunkX: number, chunkZ: number): number =>
                (chunkX - origin.originChunkX) ** 2 + (chunkZ - origin.originChunkZ) ** 2;
            const nearest = source
                .usedSets()
                .flatMap((named) =>
                    candidateChunksIn(named.set.placement, SEED, {
                        minChunkX: origin.originChunkX - origin.radiusInChunks,
                        minChunkZ: origin.originChunkZ - origin.radiusInChunks,
                        maxChunkX: origin.originChunkX + origin.radiusInChunks,
                        maxChunkZ: origin.originChunkZ + origin.radiusInChunks
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
                radiusInChunks: 16,
                wanted: () => true
            });

            expect(found?.origin).toEqual({ x: found!.chunkX * 16 + 8, y: 64, z: found!.chunkZ * 16 + 8 });
        });

        it('finds nothing when the predicate wants a structure this world does not place', () => {
            const found = sourceOf().locate({
                originChunkX: 0,
                originChunkZ: 0,
                radiusInChunks: 32,
                wanted: (structure) => structure === 'test:mansion'
            });

            expect(found).toBe(undefined);
        });

        it('finds nothing when the biome refuses every candidate in range', () => {
            const found = sourceOf([ELSEWHERE]).locate({
                originChunkX: 0,
                originChunkZ: 0,
                radiusInChunks: 32,
                wanted: () => true
            });

            expect(found).toBe(undefined);
        });

        it('finds nothing when the radius reaches no candidate at all', () => {
            // A spacing of four chunks guarantees a candidate within four, so a radius of zero
            // on a chunk that is not itself one has nothing to offer.
            const source = sourceOf();
            const atOrigin = source.locate({
                originChunkX: 1,
                originChunkZ: 1,
                radiusInChunks: 0,
                wanted: () => true
            });

            expect(atOrigin).toBe(undefined);
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

            // A radius of 40 chunks over a spacing of four covers about 400 candidates. The
            // nearest one matches, so the scan must not walk the rest of them.
            source.locate({ originChunkX: 0, originChunkZ: 0, radiusInChunks: 40, wanted: () => true });

            expect(assemblies).toBe(1);
        });
    });
});
