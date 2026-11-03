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

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { definitionOf } from '../content/ContentOptions';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import type { WorldContentFacts } from './contentAdapter';
import { worldContentGroups } from './contentAdapter';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionByName, dimensionTypeOf } from './Dimension';
import { VANILLA_DIMENSION_TYPES } from './vanillaDimensionTypes';
import GameRuleManager, { GameRules } from './GameRuleManager';
import { DataDrivenGenerator } from './generators/datadriven/DataDrivenGenerator';
import { bedrockBiomeIdOf } from './generators/datadriven/javaTranslation';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { World } from './World';
import { fakeLevel } from '../testing/level';

const DIMENSION = 'minecraft:overworld';

/**
 * What the blocks of a column answer about themselves, for the spawn floor.
 *
 * One dense id per identifier and one solidity per dense id, which is the shape the built
 * content has; the test names the few blocks a column is made of rather than every state the
 * palette holds.
 */
const blocksThatAre = (solidity: Readonly<Record<string, boolean>>): WorldContentFacts['blocks'] => {
    const identifiers = Object.keys(solidity);
    const solid = Uint8Array.from(identifiers, (identifier) => (solidity[identifier] === true ? 1 : 0));

    return {
        types: new Map(identifiers.map((identifier, runtimeId) => [identifier, { state: () => ({ runtimeId }) }])),
        table: { solid }
    };
};

/**
 * The content the groups read, which is the biome registry, the block columns and the tags.
 *
 * The real `ServerContent` needs a whole pack stack to build, and
 * `content/world/serverSource.test.ts` covers these groups over one. Here those three are what
 * matter, so the double is `WorldContentFacts` rather than a build.
 */
const contentWith = (
    tags: Readonly<Record<string, readonly string[]>>,
    blocks: WorldContentFacts['blocks'] = blocksThatAre({}),
    leaves: readonly string[] = []
): WorldContentFacts => ({
    biomes: Object.entries(tags).map(([identifier, names]) => [
        identifier,
        definitionOf('biomes', identifier, {
            'minecraft:biome': { description: { identifier }, components: { 'minecraft:tags': { tags: names } } }
        })
    ]),
    blocks,
    tags: {
        includes: (registry, tag, identifier) =>
            registry === 'block' && tag === 'minecraft:leaves' && leaves.includes(identifier)
    }
});

/** The world's groups over one in-memory chunk at the origin, on a real `World`. */
const groupsOver = (chunk: Chunk, content: WorldContentFacts) => {
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

    it('exposes a loaded chunk revision and runtime id for navigation reads', () => {
        const chunk = new Chunk(0, 0);
        const { blocks } = groupsOver(chunk, contentWith({}));
        const at = { x: 3, y: 64, z: 9 };
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const air = BlockRuntimeIds.getByName('minecraft:air');

        chunk.setBlockRuntimeId(at.x, at.y, at.z, stone);
        const firstRevision = blocks.blockChunkRevisionAt?.(at);
        expect(blocks.blockChunkIdentityAt?.(at)).toBe(chunk);
        expect(firstRevision).toBe(chunk.getBlockRevision());
        expect(blocks.runtimeIdAt?.(at)).toBe(stone);

        chunk.fillColumn(at.x, at.z, at.y + 1, at.y + 1, stone);
        expect(blocks.blockChunkRevisionAt?.(at)).toBeGreaterThan(firstRevision ?? -1);
        chunk.setBlockRuntimeId(at.x, at.y, at.z, air);
        expect(blocks.runtimeIdAt?.(at)).toBe(air);
    });
});

/**
 * `surfaceY` is the one position the surface spawn pass tries, and every passive spawn rule
 * names the ground it belongs on. A column whose answer is the canopy or the grass standing in
 * it therefore spawns nothing at all, which is most of an overworld.
 */
describe('the spawn floor of a column', () => {
    const GRASS = 'minecraft:grass_block';
    const LEAVES = 'minecraft:oak_leaves';
    const TALL_GRASS = 'minecraft:tall_grass';
    const WATER = 'minecraft:water';

    const COLUMN = blocksThatAre({
        'minecraft:air': false,
        [GRASS]: true,
        // Leaves do carry a collision box; they are left out of the floor by name.
        [LEAVES]: true,
        [TALL_GRASS]: false,
        [WATER]: false
    });

    /** A world holding one chunk, with the named blocks written into the column at 3, 9. */
    const columnOf = (column: ReadonlyArray<readonly [number, string]>) => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        for (const [y, identifier] of column) {
            chunk.setBlockRuntimeId(3, y, 9, BlockRuntimeIds.getByName(identifier));
        }

        return groupsOver(chunk, contentWith({}, COLUMN, [LEAVES])).blocks.surfaceY(3, 9);
    };

    it('stands a mob on the ground under a canopy rather than on the canopy', () => {
        expect(
            columnOf([
                [62, GRASS],
                [63, GRASS],
                [70, LEAVES],
                [71, LEAVES]
            ])
        ).toBe(64);
    });

    it('stands a mob on the ground under the grass growing out of it', () => {
        expect(
            columnOf([
                [63, GRASS],
                [64, TALL_GRASS]
            ])
        ).toBe(64);
    });

    it('keeps the top of a water column, which is where a fish spawns', () => {
        expect(
            columnOf([
                [50, GRASS],
                [51, WATER],
                [52, WATER],
                [53, WATER]
            ])
        ).toBe(54);
    });

    it('has no answer for a column with nothing to stand on', () => {
        expect(columnOf([[70, LEAVES]])).toBeUndefined();
        expect(columnOf([])).toBeUndefined();
    });
});

describe('dimension brightness', () => {
    it('keeps the End and Nether ambient light floors in rule-facing brightness', () => {
        const lightAt = (dimension: (typeof Dimensions)[keyof typeof Dimensions]) => {
            const world: World = Object.assign(Object.create(World.prototype), {
                dimension,
                systems: {
                    lighting: {
                        getBlockLight: () => 0,
                        getSkyLight: () => 15
                    }
                }
            });
            const groups = worldContentGroups({
                dimension: dimension.id,
                world: () => world,
                seed: 0n,
                difficulty: () => 2,
                random: constantRandom(0),
                content: () => contentWith({})
            });

            return groups.blocks.light({ x: 0, y: 80, z: 0 });
        };

        expect(lightAt(Dimensions.TheEnd)).toBe(3);
        expect(lightAt(Dimensions.Nether)).toBe(1);
        expect(lightAt(Dimensions.Overworld)).toBe(15);
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
            level: fakeLevel({ server, gameRules: rules })
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
    /**
     * The level group for a dimension name, over a world of that dimension with no chunks
     * behind it whose generator floods to `seaLevel`, or to nothing in particular when left out.
     */
    const levelOf = (dimension: string, seaLevel?: number) => {
        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            dimension: dimensionByName(dimension) ?? Dimensions.Overworld,
            generator: seaLevel === undefined ? {} : { seaLevel }
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

    it('reads the bounds and sky light of the dimension it was named', () => {
        expect(levelOf('minecraft:overworld')).toMatchObject({ minY: -64, maxY: 320, hasSkyLight: true });
        expect(levelOf('minecraft:nether')).toMatchObject({ minY: 0, maxY: 128, hasSkyLight: false });
        expect(levelOf('minecraft:the_end')).toMatchObject({ minY: 0, maxY: 256 });
    });

    it('reads the sea level from the live world, whose generator knows its water line', () => {
        // The three vanilla `noise_settings` values, which the generator reports rather than
        // a table keyed by dimension: a custom stem over the Nether type floods wherever its
        // settings say.
        expect(levelOf('minecraft:overworld', 63).seaLevel).toBe(63);
        expect(levelOf('minecraft:nether', 32).seaLevel).toBe(32);
        expect(levelOf('minecraft:the_end', 0).seaLevel).toBe(0);
    });

    it('assumes the Overworld water line for a generator that reports none', () => {
        expect(levelOf('minecraft:nether').seaLevel).toBe(63);
    });

    it('answers for the Overworld when the name is not a vanilla dimension and no world is loaded', () => {
        const level = worldContentGroups({
            dimension: 'mypack:sky',
            world: () => undefined,
            seed: 0n,
            difficulty: () => 2,
            random: constantRandom(0),
            content: () => contentWith({})
        }).level;

        expect(level).toMatchObject({ minY: -64, maxY: 320, hasSkyLight: true });
    });

    it("reads a custom dimension's bounds and sky light from the type the level resolved", () => {
        // The level gave this type its id and clamped its bounds; the Overworld's -64 and sky
        // would put every content rule's column and light check in the wrong place.
        const sky = dimensionTypeOf(
            { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: 0, height: 128, hasSkylight: false },
            'mypack:sky',
            FIRST_CUSTOM_DIMENSION_ID
        );
        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            dimension: sky,
            generator: {}
        });

        const level = worldContentGroups({
            dimension: 'mypack:sky',
            world: () => world,
            seed: 0n,
            difficulty: () => 2,
            random: constantRandom(0),
            content: () => contentWith({})
        }).level;

        expect(level).toMatchObject({ minY: 0, maxY: 128, hasSkyLight: false });
    });
});
