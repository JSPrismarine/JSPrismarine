import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { behaviorFor, vanillaBlockPalette } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import { Difficulty } from '@jsprismarine/minecraft';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { definitionOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import { serverWorldSource } from '../content/world/serverSource';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { worldBlockEntities } from './contentAdapter';
import { createEngineWorld } from './EngineWorld';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';
import type { SystemBlock } from './WorldSystems';
import { contentBlockTickHandlers } from './blockTicks';
import { inertEntityRuntime, testContent } from '../testing/entityServer';

/**
 * The engine systems, driven by a real world tick.
 *
 * Everything here goes through {@link World.update}: the scheduled tick lists, the engine
 * that drains them, and the chunks it writes into. The parts of the server a world needs
 * before it will exist at all - the config, the logger, the block registry and the chunk
 * provider - are stood in for, and nothing else is.
 */

/** The top of the stone floor every circuit in this file stands on. */
const GROUND = 63;

const idOf = (block: SystemBlock): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(block.name, block.states);
    if (runtimeId === null) throw new Error(`no such block state ${block.name}`);
    return runtimeId;
};

const named = (name: string, states: SystemBlock['states'] = {}): SystemBlock => ({ name, states });

const STONE = named('minecraft:stone');
const WATER = named('minecraft:water', { liquid_depth: 0 });
/** A chunk of stone up to {@link GROUND} and air above it. */
const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    for (let bx = 0; bx < 16; bx++) {
        for (let bz = 0; bz < 16; bz++) chunk.fillColumn(bx, bz, -64, GROUND, idOf(STONE));
    }
    return chunk;
};

const testServer = (content: ServerContent = testContent()): Server =>
    stub<Server>({
        getLogger: () =>
            stub<Logger>({
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
                verbose: () => {}
            }),
        getConfig: () =>
            stub<Config>({
                getDifficulty: () => Difficulty.NORMAL,
                getEntityTrackingInterval: () => 20
            }),
        // The fixture has no world behavior for water unless the fluid test asks for it.
        getContent: () => content,
        getEntityRuntime: () => inertEntityRuntime()
    });

/** Builds the liquid behavior definitions against the world this test creates. */
const fluidContentFor = (world: () => World | undefined): ServerContent => {
    let built: ServerContent | undefined;
    const fixture = fixtureDefinitions();
    const definitions = { ...fixture, blocks: new Map(fixture.blocks) };

    for (const identifier of ['minecraft:water', 'minecraft:flowing_water']) {
        definitions.blocks.set(
            identifier,
            definitionOf('blocks', identifier, {
                format_version: '1.26.20',
                'minecraft:block': {
                    description: { identifier },
                    components: { 'jsprismarine:behavior': behaviorFor(identifier) }
                }
            })
        );
    }

    built = buildServerContent(
        fixtureContentOptions({
            load: () => ({ definitions, diagnostics: [] }),
            blockPalette: vanillaBlockPalette(),
            world: serverWorldSource({
                worldFor: () => world(),
                content: () => {
                    if (built === undefined) throw new Error('fluid content was read before it finished building');
                    return built;
                },
                seed: 0n,
                difficulty: () => Difficulty.NORMAL
            })
        })
    );

    return built;
};

/**
 * Sets the random tick speed on a world that has finished being built.
 *
 * `getGameRuleManager` still answers `null`, because the manager's own change callback can
 * fire while the world's constructor is still running. By the time a test holds a world it
 * cannot be null, so an absent one is a failure rather than a rule quietly left unset.
 */
const setRandomTickSpeed = (world: World, blocksPerSubChunk: number): void => {
    const rules = world.getGameRuleManager();
    if (rules === null) throw new Error('the world was built without a game rule manager');
    rules.setGameRule('randomTickSpeed', blocksPerSubChunk, true);
};

/** A world with nine flat chunks around the origin already in memory. */
const flatWorld = async (
    randomTickHandlers?: Record<string, (at: { x: number; y: number; z: number }) => void>,
    buildContent?: (world: () => World | undefined) => ServerContent
) => {
    let world: World | undefined;
    const content = buildContent?.(() => world) ?? testContent();

    world = new World({
        name: 'engine-systems-test',
        path: path.join(os.tmpdir(), 'engine-systems-test'),
        server: testServer(content),
        provider: stub<BaseProvider & Provider>({ readChunk: async (_dimension, x, z) => flatChunk(x, z) }),
        seed: 0n,
        generator: stub<Generator>({}),
        randomTickHandlers,
        blockTickHandlers:
            buildContent === undefined
                ? undefined
                : contentBlockTickHandlers({
                      content,
                      world: () => world,
                      report: (_identifier, error) => {
                          throw error;
                      }
                  })
    });

    for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) await world.loadChunk(x, z);
    }

    return world;
};

/** Puts a block into the chunk without announcing it: circuit building, not a change. */
const place = (world: World, x: number, y: number, z: number, block: SystemBlock): void => {
    world.getLoadedChunk(x >> 4, z >> 4)!.setBlockRuntimeId(x & 0xf, y, z & 0xf, idOf(block));
};

const nameAt = (world: World, x: number, y: number, z: number): string =>
    world.loadedBlockAt(x, y, z)?.name ?? 'nothing loaded';

const stateAt = (world: World, x: number, y: number, z: number, state: string) =>
    world.loadedBlockAt(x, y, z)?.states[state];

const runTicks = async (world: World, ticks: number): Promise<void> => {
    for (let tick = 0; tick < ticks; tick++) await world.update(world.getTicks() + 1);
};

/**
 * Puts somebody in the world, at the origin.
 *
 * Java simulates a chunk only while a player ticket holds it, so a world with nobody in it
 * random-ticks nothing at all. Written straight into the world's own map rather than through
 * `addEntity`, which wants a whole live player with a network session behind it; the ticket rule
 * reads a position and nothing else.
 */
const standInPlayer = (world: World): void => {
    const held = world as unknown as { players: Map<bigint, { isOnline(): boolean; getPosition(): Vector3 }> };
    held.players.set(1n, { isOnline: () => true, getPosition: () => new Vector3(0, GROUND + 1, 0) });
};

describe('world', () => {
    describe('engine systems', () => {
        // The world's constructor makes its own folder under the server directory.
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-engine-'));
        const previousDirectory = process.env['JSP_DIR'];

        beforeAll(() => {
            process.env['JSP_DIR'] = directory;
        });

        afterAll(() => {
            if (previousDirectory === undefined) delete process.env['JSP_DIR'];
            else process.env['JSP_DIR'] = previousDirectory;
            fs.rmSync(directory, { recursive: true, force: true });
        });

        /**
         * The container fill level a comparator reads.
         *
         * The value comes from the chunk's own block entity, so a second world view reads the
         * same stored contents.
         */
        describe('what the engine keeps in a block entity', () => {
            it('reads a chest fill level back as a comparator input', async () => {
                const world = await flatWorld();
                const store = worldBlockEntities(() => world);
                const chest = { x: 0, y: GROUND + 1, z: 0 };

                place(world, chest.x, chest.y, chest.z, named('minecraft:chest'));
                store.put(chest, { capacity: 27, items: [{ identifier: 'minecraft:stone', count: 64 }] });

                // Java's `AbstractContainerMenu.getRedstoneSignalFromContainer`: one full
                // stack of twenty-seven slots is floor(1/27 * 14) + 1, which is one.
                expect(createEngineWorld(world).getBlockEntityData(chest)?.analogOutput).toBe(1);
            });

            it('answers nothing for a position holding no block entity at all', async () => {
                const world = await flatWorld();

                expect(createEngineWorld(world).getBlockEntityData({ x: 3, y: GROUND + 1, z: 3 })).toBeUndefined();
            });
        });

        describe('weather', () => {
            it('starts clear, and `/weather` is what changes it', async () => {
                const world = await flatWorld();

                expect(world.getWeather()).toBe('clear');

                world.setWeather('thunder', 1000);

                expect(world.getWeather()).toBe('thunder');
            });

            it("rains on open sky and not under a roof, which is Java's `isRainingAt`", async () => {
                const world = await flatWorld();

                expect(world.isRainingAt(0, GROUND + 1, 0)).toBe(false);

                world.setWeather('rain', 1000);
                // A roof over one column only, which is the case a chunk-wide height would
                // get wrong: it would shelter all 256 columns from one block.
                world.setLoadedBlockState(2, GROUND + 4, 2, STONE, true);
                await runTicks(world, 1);

                expect(world.isRainingAt(0, GROUND + 1, 0)).toBe(true);
                expect(world.isRainingAt(1, GROUND + 1, 1)).toBe(true);
                expect(world.isRainingAt(2, GROUND + 1, 2)).toBe(false);
                // Java agrees with the light engine about the roof block itself: `canSeeSky`
                // compares the heightmap against the position, and a solid block raises the
                // heightmap past its own y. The rain lands on the block above it.
                expect(world.isRainingAt(2, GROUND + 4, 2)).toBe(false);
                expect(world.isRainingAt(2, GROUND + 5, 2)).toBe(true);
            });

            it('answers no for a position in a chunk nobody has loaded', async () => {
                const world = await flatWorld();
                world.setWeather('rain', 1000);

                expect(world.isRainingAt(4096, GROUND + 1, 4096)).toBe(false);
            });
        });

        describe('fluids', () => {
            it('spreads a placed water source across the floor over the ticks that follow', async () => {
                const world = await flatWorld(undefined, fluidContentFor);

                const content = world.getServer().getContent();
                if (content === undefined) throw new Error('the fluid fixture built no content');
                content.world.blockWorld
                    .at(world.getDimension().name)
                    .setBlock({ x: 0, y: GROUND + 1, z: 0 }, WATER.name, WATER.states);
                expect(nameAt(world, 1, GROUND + 1, 0)).toBe('minecraft:air');

                await runTicks(world, 20);

                expect(nameAt(world, 1, GROUND + 1, 0)).toBe('minecraft:flowing_water');
                expect(stateAt(world, 1, GROUND + 1, 0, 'liquid_depth')).toBe(1);
                expect(nameAt(world, 2, GROUND + 1, 0)).toBe('minecraft:flowing_water');
                expect(stateAt(world, 2, GROUND + 1, 0, 'liquid_depth')).toBe(2);
            });
        });

        describe('random ticks', () => {
            it('grows the crop a random tick landed on', async () => {
                const grown: string[] = [];
                const world = await flatWorld({
                    'minecraft:wheat': (at) => {
                        const growth = Number(stateAt(world, at.x, at.y, at.z, 'growth') ?? 0);
                        if (growth >= 7) return;

                        grown.push(`${at.x},${at.y},${at.z}`);
                        world.setLoadedBlockState(
                            at.x,
                            at.y,
                            at.z,
                            named('minecraft:wheat', { growth: growth + 1 }),
                            false
                        );
                    }
                });

                // A field of crops on the ground, which is where they can stand: the rest of
                // the world is stone and air, and neither takes a random tick at all.
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++)
                        place(world, x, GROUND + 1, z, named('minecraft:wheat', { growth: 0 }));
                }

                // Far above Java's three, so a handful of ticks is certain to land on the one
                // layer of the chunk that holds a crop.
                setRandomTickSpeed(world, 50);
                standInPlayer(world);

                await runTicks(world, 3);

                expect(grown.length).toBeGreaterThan(0);
                for (const position of grown) {
                    const [x, y, z] = position.split(',').map(Number);
                    expect(stateAt(world, x!, y!, z!, 'growth')).toBeGreaterThan(0);
                }
            });

            it('draws nothing at all with nobody in the world', async () => {
                const ticked: string[] = [];
                const world = await flatWorld({ 'minecraft:wheat': (at) => ticked.push(`${at.x},${at.y},${at.z}`) });
                setRandomTickSpeed(world, 50);

                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++)
                        place(world, x, GROUND + 1, z, named('minecraft:wheat', { growth: 0 }));
                }

                // Java's player ticket: a chunk nobody is near is loaded and still, which is why
                // crops do not grow while their farmer is logged off.
                await runTicks(world, 5);

                expect(ticked).toEqual([]);
            });

            it('draws nothing when the random tick speed game rule is zero', async () => {
                const ticked: string[] = [];
                const world = await flatWorld({ 'minecraft:wheat': (at) => ticked.push(`${at.x},${at.y},${at.z}`) });
                setRandomTickSpeed(world, 0);
                standInPlayer(world);

                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++)
                        place(world, x, GROUND + 1, z, named('minecraft:wheat', { growth: 0 }));
                }

                await runTicks(world, 5);

                expect(ticked).toEqual([]);
            });
        });
    });
});
