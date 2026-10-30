/**
 * The biome half of the world's content groups, over the real biome tables.
 *
 * The first two cases run always: they cover every biome id this server can write, which is
 * exactly the set the data-driven generator can write. The last one generates
 * a real overworld chunk and reads the biomes back out of it, and is gated the same way
 * `generators/datadriven/DataDrivenGenerator.test.ts` is:
 *
 * ```sh
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/contentAdapter
 * ```
 */
import type { Logger } from '@jsprismarine/logger';
import { bedrockBiomeToJava, javaIdentifierToBedrock } from '@jsprismarine/mapping';
import { constantRandom } from '@jsprismarine/predicates';
import { beforeAll, describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import type { WorldContentBiomes } from './contentAdapter';
import { worldContentGroups } from './contentAdapter';
import { Dimensions } from './Dimension';
import GameRuleManager, { GameRules } from './GameRuleManager';
import { DataDrivenGenerator } from './generators/datadriven/DataDrivenGenerator';
import { bedrockBiomeIdOf } from './generators/datadriven/javaTranslation';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { World } from './World';

const DIMENSION = 'minecraft:overworld';

/**
 * The biome definitions the groups read, which is all of the content they touch.
 *
 * The real `ServerContent` needs a whole pack stack to build, and
 * `content/world/serverSource.test.ts` covers these groups over one. Here the registry is what
 * matters, so the double is `WorldContentBiomes` rather than a build.
 */
const contentWith = (tags: Readonly<Record<string, readonly string[]>>): WorldContentBiomes => ({
    biomes: Object.entries(tags).map(([identifier, names]) => [
        identifier,
        definitionOf('biomes', identifier, {
            'minecraft:biome': { description: { identifier }, components: { 'minecraft:tags': { tags: names } } }
        })
    ])
});

/** The world's groups over one in-memory chunk at the origin, on a real `World`. */
const groupsOver = (chunk: Chunk, content: WorldContentBiomes) => {
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        dimension: Dimensions.Overworld
    });

    return worldContentGroups({
        dimension: DIMENSION,
        world: () => world,
        seed: 0n,
        difficulty: () => 2,
        random: constantRandom(0),
        content: () => content
    });
};

describe('the biome a chunk stores', () => {
    it('resolves every id the generator can write back to a Java biome', () => {
        // Derived from the mapping rather than from a list of numbers kept here: every Bedrock
        // biome with a Java source behind it is one the generator may write.
        const ids = Array.from({ length: 256 }, (_unused, id) => id).filter(
            (id) => bedrockBiomeToJava(id).kind === 'mapped'
        );
        expect(ids.length).toBeGreaterThan(0);

        for (const id of ids) {
            const result = bedrockBiomeToJava(id);
            if (result.kind !== 'mapped') continue;

            // The generator reaches that very id when it is given the Java biome behind it.
            expect(bedrockBiomeIdOf(result.java), `${id}`).toBe(id);

            // And back again: the Java biome the inverse names maps onto the same Bedrock one.
            expect(javaIdentifierToBedrock('biome', result.java)).toEqual({
                kind: 'mapped',
                bedrock: result.bedrock.identifier
            });
        }
    });

    it('answers the identifier and the tags through the world content groups', () => {
        const chunk = new Chunk(0, 0);
        const content = contentWith({ 'minecraft:mesa': ['mesa', 'overworld'] });
        const { blocks } = groupsOver(chunk, content);

        chunk.getBiomes().fillColumn(3, 9, bedrockBiomeIdOf('minecraft:badlands'));

        expect(blocks.biome({ x: 3, y: 64, z: 9 })).toBe('minecraft:mesa');
        expect(blocks.biomeTags({ x: 3, y: 64, z: 9 })).toEqual(['mesa', 'overworld']);
        // The neighbouring column is still what the chunk was filled with.
        expect(blocks.biome({ x: 4, y: 64, z: 9 })).toBe('minecraft:plains');
        expect(blocks.biomeTags({ x: 4, y: 64, z: 9 })).toEqual([]);
    });
});

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

/** Terrain alone is about 0.6 seconds a chunk, and the biome source runs before it. */
const CHUNK_TIMEOUT = 180_000;

describe.skipIf(!enabled)('the biomes of a generated overworld', { tags: ['real-data'] }, () => {
    let generator: DataDrivenGenerator;

    beforeAll(() => {
        const registries = loadJavaWorldgenRegistries(sources!);
        generator = new DataDrivenGenerator({ registries, decorate: false, carve: false });
    }, CHUNK_TIMEOUT);

    it(
        'names every biome the generator wrote into a chunk',
        async () => {
            const named = new Set<string>();

            // Four chunks far enough apart to land in different climates; one chunk is often
            // one biome from the floor to the sky.
            for (const [cx, cz] of [
                [0, 0],
                [40, -40],
                [-80, 120],
                [300, 300]
            ]) {
                const chunk = await generator.generateChunk(cx!, cz!, 1234n);
                const { blocks } = groupsOver(chunk, contentWith({}));

                for (let y = Dimensions.Overworld.minY; y < 320; y += 16) {
                    for (let x = 0; x < 16; x += 4) {
                        for (let z = 0; z < 16; z += 4) {
                            const identifier = blocks.biome({ x, y, z });
                            // No fallback and no guess: every id in the column has a name.
                            expect(identifier, `${cx},${cz} at ${x},${y},${z}`).toBeDefined();
                            if (identifier !== undefined) named.add(identifier);
                        }
                    }
                }
            }

            // And each of them has a Java biome behind it, which is the round trip the
            // generator's Java-to-Bedrock pass made on the way in.
            for (const identifier of named) {
                expect(bedrockBiomeToJava(identifier).kind, identifier).toBe('mapped');
            }
            expect(named.size).toBeGreaterThan(1);
        },
        CHUNK_TIMEOUT
    );
});

describe('the game rules a world carries', () => {
    /** The level group over a world whose rules a test sets, with no chunks behind it. */
    const levelWithRules = (set: ReadonlyArray<readonly [string, boolean | number]>) => {
        const server = stub<Server>({ getLogger: () => stub<Logger>({ error: () => {} }) });
        const rules = new GameRuleManager(server);
        for (const [name, value] of set) rules.setGameRule(name, value, true);

        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            dimension: Dimensions.Overworld,
            gameRuleManager: rules
        });

        return worldContentGroups({
            dimension: DIMENSION,
            world: () => world,
            seed: 0n,
            difficulty: () => 2,
            random: constantRandom(0),
            content: () => contentWith({})
        }).level;
    };

    it('answers the 1.21.11 id out of a world that stores the camelCase name', () => {
        const level = levelWithRules([[GameRules.MobGriefing, false]]);

        expect(level.gameRule('minecraft:mob_griefing')).toBe(false);
        expect(level.gameRule('mobGriefing')).toBe(false);
        expect(level.gameRule('mobgriefing')).toBe(false);
    });

    it('reports the rules it was never given as absent, rather than as off', () => {
        const level = levelWithRules([]);

        expect(level.gameRule('minecraft:locator_bar')).toBeUndefined();
        expect(level.gameRule('nonsense')).toBeUndefined();
    });

    it('hands an integer rule back as a number', () => {
        const level = levelWithRules([[GameRules.RandomTickSpeed, 7]]);

        expect(level.gameRule('minecraft:random_tick_speed')).toBe(7);
    });
});

describe('the level facts a dimension answers', () => {
    /** The level group for a dimension name, over a world with no chunks behind it. */
    const levelOf = (dimension: string) => {
        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            dimension: Dimensions.Overworld
        });

        return worldContentGroups({
            dimension,
            world: () => world,
            seed: 0n,
            difficulty: () => 2,
            random: constantRandom(0),
            content: () => contentWith({})
        }).level;
    };

    it('reads the bounds, sky light and sea level of the dimension it was named', () => {
        expect(levelOf('minecraft:overworld')).toMatchObject({ minY: -64, maxY: 320, hasSkyLight: true, seaLevel: 63 });
        expect(levelOf('minecraft:nether')).toMatchObject({ minY: 0, maxY: 128, hasSkyLight: false, seaLevel: 32 });
        expect(levelOf('minecraft:the_end')).toMatchObject({ minY: 0, maxY: 256, seaLevel: 0 });
    });

    it('answers for the Overworld when the name is not a vanilla dimension', () => {
        expect(levelOf('mypack:sky')).toMatchObject({ minY: -64, maxY: 320, hasSkyLight: true, seaLevel: 63 });
    });
});
