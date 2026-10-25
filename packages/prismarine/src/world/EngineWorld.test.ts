import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { REDSTONE_TORCH, REPEATER, SIGNAL_STATE } from '@jsprismarine/engine-systems';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type BlockManager from '../block/BlockManager';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type Config from '../config/Config';
import type LoggerBuilder from '../utils/Logger';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';
import type { SystemBlock } from './WorldSystems';

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
const REDSTONE_BLOCK = named('minecraft:redstone_block');
const WIRE = named('minecraft:redstone_wire', { [SIGNAL_STATE]: 0 });
const WATER = named('minecraft:water', { liquid_depth: 0 });

/** A chunk of stone up to {@link GROUND} and air above it. */
const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    for (let bx = 0; bx < 16; bx++) {
        for (let bz = 0; bz < 16; bz++) chunk.fillColumn(bx, bz, -64, GROUND, idOf(STONE));
    }
    return chunk;
};

const testServer = (): Server =>
    stub<Server>({
        getLogger: () =>
            stub<LoggerBuilder>({
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
        getBlockManager: () => stub<BlockManager>({ findBlock: () => null }),
        // No content, so no data-driven entities; the world keeps the written classes.
        getEntityRuntime: () => undefined
    });

/** A world with nine flat chunks around the origin already in memory. */
const flatWorld = async (randomTickHandlers?: Record<string, (at: { x: number; y: number; z: number }) => void>) => {
    const world = new World({
        name: 'engine-systems-test',
        server: testServer(),
        provider: stub<BaseProvider & Provider>({ readChunk: async (x, z) => flatChunk(x, z) }),
        seed: 0,
        generator: stub<Generator>({}),
        randomTickHandlers
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

        describe('redstone', () => {
            it('powers the dust beside a torch the moment the torch goes down', async () => {
                const world = await flatWorld();
                place(world, 1, GROUND + 1, 0, WIRE);

                world.setLoadedBlockState(0, GROUND + 1, 0, named(REDSTONE_TORCH.lit), true);

                expect(stateAt(world, 1, GROUND + 1, 0, SIGNAL_STATE)).toBe(15);
            });

            it('puts the torch out two ticks after the repeater feeding its block turns on', async () => {
                const world = await flatWorld();

                // A repeater pointing north takes its input from the north and powers the
                // block to its south, which is the block the torch stands on.
                place(world, 0, GROUND + 1, -1, named(REPEATER.unpowered, { repeater_delay: 0 }));
                place(world, 0, GROUND + 1, 0, STONE);
                // The dust needs something to lie on, or the support rules break it.
                place(world, 1, GROUND + 1, 0, STONE);
                place(world, 1, GROUND + 2, 0, WIRE);

                // Written through the world rather than into the chunk, so the placement
                // updates run and the dust beside it hears about the torch.
                world.setLoadedBlockState(0, GROUND + 2, 0, named(REDSTONE_TORCH.lit), true);
                expect(stateAt(world, 1, GROUND + 2, 0, SIGNAL_STATE)).toBe(15);

                // Feeding the repeater is what starts the chain; everything after it is the
                // world tick draining the scheduled tick lists into the engine.
                world.setLoadedBlockState(0, GROUND + 1, -2, REDSTONE_BLOCK, true);

                await runTicks(world, 1);
                expect(nameAt(world, 0, GROUND + 1, -1)).toBe(REPEATER.unpowered);

                await runTicks(world, 1);
                expect(nameAt(world, 0, GROUND + 1, -1)).toBe(REPEATER.powered);
                expect(nameAt(world, 0, GROUND + 2, 0)).toBe(REDSTONE_TORCH.lit);

                await runTicks(world, 2);
                expect(nameAt(world, 0, GROUND + 2, 0)).toBe(REDSTONE_TORCH.unlit);
                expect(stateAt(world, 1, GROUND + 2, 0, SIGNAL_STATE)).toBe(0);
            });
        });

        describe('pistons', () => {
            it('extends an arm into the block in front and takes it back when the power goes', async () => {
                const world = await flatWorld();

                // Facing east, written the way the palette holds it: Bedrock's piston calls
                // east 4, and its north and south are the other way round from everything
                // else's, which is why the engine never spells a direction itself.
                place(world, 0, GROUND + 1, 0, named('minecraft:piston', { facing_direction: 4 }));

                // A redstone block against the back of the piston powers it.
                world.setLoadedBlockState(-1, GROUND + 1, 0, REDSTONE_BLOCK, true);

                expect(nameAt(world, 1, GROUND + 1, 0)).toBe('minecraft:piston_arm_collision');
                expect(stateAt(world, 1, GROUND + 1, 0, 'facing_direction')).toBe(4);

                world.setLoadedBlockState(-1, GROUND + 1, 0, named('minecraft:air'), true);

                expect(nameAt(world, 1, GROUND + 1, 0)).toBe('minecraft:air');
                expect(nameAt(world, 0, GROUND + 1, 0)).toBe('minecraft:piston');
            });

            it('pushes the block in front of it along', async () => {
                const world = await flatWorld();

                place(world, 0, GROUND + 1, 0, named('minecraft:piston', { facing_direction: 4 }));
                place(world, 1, GROUND + 1, 0, named('minecraft:dirt'));

                world.setLoadedBlockState(-1, GROUND + 1, 0, REDSTONE_BLOCK, true);

                expect(nameAt(world, 2, GROUND + 1, 0)).toBe('minecraft:dirt');
                expect(nameAt(world, 1, GROUND + 1, 0)).toBe('minecraft:piston_arm_collision');
            });
        });

        describe('fluids', () => {
            it('spreads a placed water source across the floor over the ticks that follow', async () => {
                const world = await flatWorld();

                world.setLoadedBlockState(0, GROUND + 1, 0, WATER, true);
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
                world.getGameRuleManager().setGameRule('randomTickSpeed', 50, true);
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
                world.getGameRuleManager().setGameRule('randomTickSpeed', 50, true);

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
                world.getGameRuleManager().setGameRule('randomTickSpeed', 0, true);
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
