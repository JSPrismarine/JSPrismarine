/**
 * `/locate`, dispatched through the server's command host against Mojang's real worldgen data.
 *
 * Three worlds share one `DataDrivenGenerator`, the way a running server's do, so a search in
 * the Nether reads the Nether's structure sets and a search in the End reads the End's. Each
 * answer is checked against the generator's own starts for the chunk it names, and the chunks
 * that `javaStructures.test.ts` verified against the 26.3 jar are the oracles.
 *
 * Gated, because it reads the Java vanilla datapack, the data generator reports and the
 * structure templates out of the server jar:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/command/host/locate.test.ts
 * ```
 */
import { createCommandSource } from '@jsprismarine/commands';
import type { CommandSource } from '@jsprismarine/commands';
import type { Logger } from '@jsprismarine/logger';
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import type { LevelStem } from '@jsprismarine/worldgen';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../../config/Config';
import type Server from '../../Server';
import { inertEntityRuntime, testContent } from '../../testing/entityServer';
import { fakeLevel } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import { Dimensions } from '../../world/Dimension';
import type { DimensionType } from '../../world/DimensionType';
import type { StemKey } from '../../world/generators/datadriven/DataDrivenGenerator';
import { DataDrivenGenerator } from '../../world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../../world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../../world/generators/datadriven/javaWorldgenData';
import type { Level } from '../../world/Level';
import { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { collectAsyncCommands } from '../Command';
import { buildVanillaCommands } from '../vanillaCommands';
import { serverCommandHost } from './serverCommandHost';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

/** Laying a structure out runs its whole generator, and a biome walk samples thousands of cells. */
const TIMEOUT = 900_000;

/** The seed `javaStructures.test.ts` verified the placements of against the 26.3 jar. */
const SEED = 1234n;

/** Where the seed's first-ring stronghold starts: 1993 blocks out, past a 100-chunk square. */
const STRONGHOLD_CHUNK = { x: -48, z: 115 };

/** Where the seed's nearest nether fortress to the origin starts, by the `nether_complexes` set. */
const FORTRESS_CHUNK = { x: 14, z: 8 };

/**
 * A chunk an end city starts in for the seed, from `javaStructures.test.ts`. Not the nearest to
 * the origin, so it bounds the answer from above rather than naming it.
 */
const END_CITY_CHUNK = { x: -77, z: -37 };

/** The three vanilla stems, keyed the way `createNoiseGeneratorFactory` keys them. */
const STEMS: Record<'overworld' | 'nether' | 'end', { key: StemKey; stem: LevelStem; dimension: DimensionType }> = {
    overworld: {
        key: {
            noiseSettings: 'minecraft:overworld',
            biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
            dimension: Dimensions.Overworld
        },
        stem: {
            type: Dimensions.Overworld.id,
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
            }
        },
        dimension: Dimensions.Overworld
    },
    nether: {
        key: {
            noiseSettings: 'minecraft:nether',
            biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
            dimension: Dimensions.Nether
        },
        stem: {
            type: Dimensions.Nether.id,
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:nether',
                biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' }
            }
        },
        dimension: Dimensions.Nether
    },
    end: {
        key: {
            noiseSettings: 'minecraft:end',
            biomeSource: { type: 'minecraft:the_end' },
            dimension: Dimensions.TheEnd
        },
        stem: {
            type: Dimensions.TheEnd.id,
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:end',
                biomeSource: { type: 'minecraft:the_end' }
            }
        },
        dimension: Dimensions.TheEnd
    }
};

interface Fixture {
    readonly generator: DataDrivenGenerator;
    readonly worlds: ReadonlyMap<string, World>;
    /** Runs one line from a position in a dimension; answers the result and what was said. */
    run(
        line: string,
        at?: { x: number; y: number; z: number; dimension?: string }
    ): Promise<{ result: number; feedback: string[]; errors: string[] }>;
}

const buildFixture = (): Fixture => {
    const registries = loadJavaWorldgenRegistries(sources!);
    const generator = new DataDrivenGenerator({
        registries,
        templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
    });

    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });
    const worlds = new Map<string, World>();

    // Annotated, because the server and its worlds name each other.
    const server: Server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime(),
        getWorldManager: () =>
            stub<WorldManager>({
                getDefaultWorld: () => worlds.get(Dimensions.Overworld.id)!,
                getDefaultLevel: () => level,
                getWorldByDimension: (dimension) => worlds.get(dimension)
            })
    });

    const level: Level = fakeLevel({
        server,
        seed: SEED,
        stems: new Map(Object.values(STEMS).map(({ stem }) => [stem.type, stem])),
        worlds: () => [...worlds.values()]
    });

    for (const { key, stem, dimension } of Object.values(STEMS)) {
        worlds.set(
            dimension.id,
            new World({
                name: dimension.id,
                path: dimension.id,
                server,
                level,
                stem,
                generator: generator.forStem(key),
                dimension
            })
        );
    }

    const registry = buildVanillaCommands();
    const host = serverCommandHost(server);

    return {
        generator,
        worlds,
        run: async (line, at = { x: 0, y: 64, z: 0 }) => {
            const feedback: string[] = [];
            const errors: string[] = [];
            const source: CommandSource = createCommandSource({
                host,
                position: { x: at.x, y: at.y, z: at.z },
                dimension: at.dimension ?? Dimensions.Overworld.id,
                permissionLevel: 5,
                onFeedback: (message) => feedback.push(message),
                onError: (message) => errors.push(message)
            });

            let results: unknown = [];
            const started = collectAsyncCommands(() => {
                results = registry.getDispatcher().execute(line, source);
            });
            await Promise.all(started);

            const result = Array.isArray(results)
                ? results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
                : 0;
            return { result, feedback, errors };
        }
    };
};

/** Java's `commands.locate.structure.success`, with the y hidden the way Java hides it. */
const FOUND = /^The nearest (\S+) is at \[(-?\d+), (~|-?\d+), (-?\d+)\] \((\d+) blocks away\)$/;

/** Reads the position out of a success line. */
const positionIn = (line: string | undefined): { x: number; y: number | '~'; z: number; distance: number } => {
    const match = line === undefined ? null : FOUND.exec(line);
    if (match === null) throw new Error(`not a locate answer: ${line}`);
    return {
        x: Number(match[2]),
        y: match[3] === '~' ? '~' : Number(match[3]),
        z: Number(match[4]),
        distance: Number(match[5])
    };
};

describe.skipIf(!enabled)('/locate through the server command host', { tags: ['real-data'] }, () => {
    let fixture: Fixture;

    beforeAll(() => {
        fixture = buildFixture();
    }, TIMEOUT);

    /** Asserts a located structure starts in the chunk the answer names, by the generator's own starts. */
    const startsWhereSaid = (
        stem: keyof typeof STEMS,
        structure: string,
        answer: { x: number; z: number }
    ): { chunkX: number; chunkZ: number } => {
        const chunkX = answer.x >> 4;
        const chunkZ = answer.z >> 4;
        const starts = fixture.generator.structureStartsAt(chunkX, chunkZ, SEED, STEMS[stem].key);
        const start = starts.find((candidate) => candidate.structure === structure);

        expect(start, `${structure} does not start at ${answer.x}, ${answer.z}`).toBeDefined();
        expect({ chunkX: start!.chunkX, chunkZ: start!.chunkZ }).toEqual({ chunkX, chunkZ });
        return { chunkX, chunkZ };
    };

    describe('a structure', () => {
        it(
            'finds the stronghold the concentric rings place, beyond a 100-chunk square',
            async () => {
                const { result, feedback } = await fixture.run('locate structure minecraft:stronghold');
                const answer = positionIn(feedback[0]);

                expect(startsWhereSaid('overworld', 'minecraft:stronghold', answer)).toEqual({
                    chunkX: STRONGHOLD_CHUNK.x,
                    chunkZ: STRONGHOLD_CHUNK.z
                });
                // Java reports the start chunk's corner, hides the y, and measures flat.
                expect(answer).toEqual({ x: -768, y: '~', z: 1840, distance: 1993 });
                expect(result).toBe(1993);
            },
            TIMEOUT
        );

        it(
            'accepts the bare name Bedrock players type',
            async () => {
                const { feedback } = await fixture.run('locate structure stronghold');

                expect(positionIn(feedback[0])).toMatchObject({ x: -768, z: 1840 });
            },
            TIMEOUT
        );

        it(
            'finds a village by its namespaced id and by the #minecraft:village tag',
            async () => {
                const byId = await fixture.run('locate structure minecraft:village_plains');
                startsWhereSaid('overworld', 'minecraft:village_plains', positionIn(byId.feedback[0]));

                const byTag = await fixture.run('locate structure #minecraft:village');
                const tagged = positionIn(byTag.feedback[0]);
                const starts = fixture.generator.structureStartsAt(tagged.x >> 4, tagged.z >> 4, SEED);
                expect(starts.some((start) => start.structure.startsWith('minecraft:village_'))).toBe(true);
                // Any village is at least as near as the plains one.
                expect(tagged.distance).toBeLessThanOrEqual(positionIn(byId.feedback[0]).distance);
            },
            TIMEOUT
        );

        it.each(['minecraft:ancient_city', 'minecraft:trial_chambers'])(
            'finds %s where the generator starts it',
            async (structure) => {
                const { feedback, errors } = await fixture.run(`locate structure ${structure}`);

                expect(errors).toEqual([]);
                startsWhereSaid('overworld', structure, positionIn(feedback[0]));
            },
            TIMEOUT
        );

        it(
            'searches the Nether when asked from the Nether',
            async () => {
                const nether = { x: 0, y: 64, z: 0, dimension: Dimensions.Nether.id };
                const fortress = await fixture.run('locate structure minecraft:fortress', nether);
                const answer = positionIn(fortress.feedback[0]);

                expect(startsWhereSaid('nether', 'minecraft:fortress', answer)).toEqual({
                    chunkX: FORTRESS_CHUNK.x,
                    chunkZ: FORTRESS_CHUNK.z
                });

                const bastion = await fixture.run('locate structure minecraft:bastion_remnant', nether);
                expect(bastion.errors).toEqual([]);
                startsWhereSaid('nether', 'minecraft:bastion_remnant', positionIn(bastion.feedback[0]));
            },
            TIMEOUT
        );

        it(
            'searches the End when asked from the End',
            async () => {
                const { feedback } = await fixture.run('locate structure minecraft:end_city', {
                    x: 0,
                    y: 64,
                    z: 0,
                    dimension: Dimensions.TheEnd.id
                });

                const { chunkX, chunkZ } = startsWhereSaid('end', 'minecraft:end_city', positionIn(feedback[0]));
                // The nearest city is at least as near as the one the structure suite knows of.
                expect(Math.hypot(chunkX, chunkZ)).toBeLessThanOrEqual(Math.hypot(END_CITY_CHUNK.x, END_CITY_CHUNK.z));
            },
            TIMEOUT
        );

        it(
            'says so when a structure cannot generate in this dimension',
            async () => {
                const { result, feedback, errors } = await fixture.run('locate structure minecraft:end_city');

                expect(result).toBe(0);
                expect(feedback).toEqual([]);
                expect(errors).toEqual(['Could not find a structure of type "minecraft:end_city" nearby']);
            },
            TIMEOUT
        );
    });

    describe('a biome', () => {
        it(
            'finds the nearest cell of a biome and reports its height',
            async () => {
                const { result, feedback, errors } = await fixture.run('locate biome minecraft:plains');

                expect(errors).toEqual([]);
                const answer = positionIn(feedback[0]);
                expect(answer.y).not.toBe('~');
                expect(result).toBe(answer.distance);

                // The chunk, generated, carries that biome at the answered cell.
                const chunk = await fixture.generator.generateChunk(answer.x >> 4, answer.z >> 4, SEED);
                const biome = bedrockBiomeToJava(chunk.getBiome(answer.x & 15, answer.y as number, answer.z & 15));
                expect(biome.kind === 'mapped' ? biome.java : biome).toBe('minecraft:plains');
            },
            TIMEOUT
        );

        it(
            'accepts a biome tag',
            async () => {
                const { feedback, errors } = await fixture.run('locate biome #minecraft:is_ocean');

                expect(errors).toEqual([]);
                expect(positionIn(feedback[0]).y).not.toBe('~');
            },
            TIMEOUT
        );

        it(
            'says so when a biome is not in this dimension',
            async () => {
                const { result, errors } = await fixture.run('locate biome minecraft:the_end');

                expect(result).toBe(0);
                expect(errors).toEqual([
                    'Could not find a biome of type "minecraft:the_end" within a reasonable distance'
                ]);
            },
            TIMEOUT
        );
    });

    describe('a point of interest', () => {
        it('is refused, because this server keeps no point of interest index', async () => {
            // A refusal is a syntax exception, which the command manager relays to the sender.
            await expect(fixture.run('locate poi minecraft:home')).rejects.toThrow('point of interest index');
        });
    });
});
