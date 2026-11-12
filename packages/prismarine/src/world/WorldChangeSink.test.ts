import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { Difficulty, LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { chestTags, replicaSink } from '../testing/sealedBlocks.test.helper';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import { Position } from './Position';
import { World } from './World';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';

/**
 * What a world hands its change sink: each sealed tick of its change log, which is the only way
 * its blocks reach clients, and the block entities of each chunk that enters. The sink here is a
 * plain recorder, which is the point: the blocks are readable without a network.
 */

const GROUND = 63;

const runtimeIdOf = (name: string, states: Record<string, string | number | boolean> = {}): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
    if (runtimeId === null) throw new Error(`no ${name} in the block catalog`);
    return runtimeId;
};

const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    for (let bx = 0; bx < 16; bx++) {
        for (let bz = 0; bz < 16; bz++) chunk.fillColumn(bx, bz, -64, GROUND, runtimeIdOf('minecraft:stone'));
    }
    return chunk;
};

/** Tags as network NBT, the form a `BlockActorData` carries them in. */
const bytesOf = (tags: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);
    return stream.getBuffer();
};

const testServer = (): Server => {
    const runtime = inertEntityRuntime();
    return stub<Server>({
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => runtime,
        hasEntityRuntime: () => true
    });
};

/** A world with one flat chunk in memory and a recorder attached as its change sink. */
const flatWorld = async () => {
    const server = testServer();
    const world = new World({
        name: 'world-change-sink-test',
        path: path.join(os.tmpdir(), 'world-change-sink-test'),
        server,
        level: fakeLevel({
            server,
            provider: stub<BaseProvider>({
                readChunk: async (_dimension, x, z) => {
                    const chunk = flatChunk(x, z);
                    if (x === 1 && z === 0)
                        chunk.setBlockEntity(
                            BlockEntityRegistry.fromNBT(
                                chestTags({ x: 20, y: GROUND + 1, z: 4 }, { 0: ['minecraft:dirt', 1] })
                            )
                        );
                    return chunk;
                }
            })
        }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });

    const { sink, sealed, replica, blockEntries } = replicaSink();
    const entered: { readonly x: number; readonly z: number; readonly blockEntities: number }[] = [];
    world.attachChangeSink({
        ...sink,
        chunkEntered: (x, z, blockEntities) => {
            const tags = [...blockEntities];
            entered.push({ x, z, blockEntities: tags.length });
            sink.chunkEntered(x, z, tags);
        }
    });
    await world.loadChunk(0, 0);

    return { world, sealed, entered, replica, blockEntries };
};

describe('world', () => {
    describe('change sink', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-worldchange-'));
        const previousDirectory = process.env['JSP_DIR'];

        beforeAll(() => {
            process.env['JSP_DIR'] = directory;
        });

        afterAll(() => {
            if (previousDirectory === undefined) delete process.env['JSP_DIR'];
            else process.env['JSP_DIR'] = previousDirectory;
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('hands the sink a block write in the sealed tick that made it', async () => {
            const { world, blockEntries } = await flatWorld();
            const glowstone = runtimeIdOf('minecraft:glowstone');

            world.beginChangeTick();
            const written = world.setLoadedBlockState(
                4,
                GROUND + 1,
                4,
                { name: 'minecraft:glowstone', states: {} },
                false
            );
            world.sealChangeTick();

            expect(written).toBe(true);
            expect(blockEntries()).toEqual([
                {
                    kind: 'field',
                    field: 'block',
                    address: { x: 4, y: GROUND + 1, z: 4, layer: 0 },
                    before: runtimeIdOf('minecraft:air'),
                    after: glowstone
                }
            ]);
        });

        it('says nothing for a write that leaves the block as it was', async () => {
            const { world, blockEntries } = await flatWorld();

            world.beginChangeTick();
            const written = world.setLoadedBlockState(4, GROUND, 4, { name: 'minecraft:stone', states: {} }, false);
            world.sealChangeTick();

            expect(written).toBe(false);
            expect(blockEntries()).toEqual([]);
        });

        it('hands the sink nothing for a unit of block writes that threw', async () => {
            const { world, blockEntries } = await flatWorld();
            const stone = runtimeIdOf('minecraft:stone');

            world.beginChangeTick();
            const outcome = world.getEntityStore().unit(() => {
                world.setLoadedBlockRuntimeId(1, GROUND + 1, 1, stone);
                world.setLoadedBlockRuntimeId(1, GROUND + 2, 1, stone);
                throw new Error('planned');
            });
            world.sealChangeTick();

            expect(outcome.failed).toBe(true);
            expect(blockEntries()).toEqual([]);
            expect(world.getLoadedChunk(0, 0)?.getBlockRuntimeId(1, GROUND + 1, 1)).toBe(runtimeIdOf('minecraft:air'));
        });

        it('hands the sink a block write made between ticks with the next tick', async () => {
            const { world, sealed, blockEntries } = await flatWorld();
            const stone = runtimeIdOf('minecraft:stone');
            world.beginChangeTick();
            world.sealChangeTick();

            world.setLoadedBlockRuntimeId(2, GROUND + 1, 2, stone);
            expect(blockEntries()).toEqual([]);
            world.beginChangeTick();
            world.sealChangeTick();

            expect(sealed).toHaveLength(2);
            // The write, then the seven block updates it queued around itself.
            expect(sealed[1]!.entries).toEqual([
                expect.objectContaining({ field: 'block', address: { x: 2, y: GROUND + 1, z: 2, layer: 0 } }),
                ...Array.from({ length: 7 }, () => expect.objectContaining({ field: 'block-update', before: null }))
            ]);
        });

        it('shows the block standing at a position for a resend, without a write', async () => {
            const { world, blockEntries } = await flatWorld();

            world.beginChangeTick();
            world.resendBlock(4, GROUND, 4);
            world.sealChangeTick();

            expect(blockEntries()).toEqual([
                {
                    kind: 'occurrence',
                    occurrence: 'block-shown',
                    data: { x: 4, y: GROUND, z: 4, block: runtimeIdOf('minecraft:stone') }
                }
            ]);
        });

        it('hands the sink an occurrence in the sealed tick that made it, and none for a unit that threw', async () => {
            // A sound or a particle for an action that was undone is not played.
            const { world, sealed } = await flatWorld();

            world.beginChangeTick();
            world.sendWorldEvent(new Vector3(1, GROUND, 1), LevelEvent.PARTICLES_CRIT, 0);
            const outcome = world.getEntityStore().unit(() => {
                world.sendWorldEvent(new Vector3(2, GROUND, 2), LevelEvent.PARTICLES_CRIT, 0);
                throw new Error('planned');
            });
            world.sealChangeTick();

            expect(outcome.failed).toBe(true);
            expect(sealed.at(-1)?.entries.filter((entry) => entry.kind === 'occurrence')).toEqual([
                {
                    kind: 'occurrence',
                    occurrence: 'world-effect',
                    data: { position: { x: 1, y: GROUND, z: 1 }, effect: LevelEvent.PARTICLES_CRIT, data: 0 }
                }
            ]);
        });

        it('logs a status effect change as an occurrence, and none for a unit that threw', async () => {
            const { world, sealed } = await flatWorld();
            const effect = {
                id: 'minecraft:speed',
                amplifier: 1,
                durationTicks: 200,
                ambient: false,
                showParticles: true,
                showIcon: true
            };

            world.beginChangeTick();
            world.sendStatusEffect({ getRuntimeId: () => 7n }, effect, 'add');
            const outcome = world.getEntityStore().unit(() => {
                world.sendStatusEffect({ getRuntimeId: () => 7n }, effect, 'remove');
                throw new Error('planned');
            });
            world.sealChangeTick();

            expect(outcome.failed).toBe(true);
            expect(sealed.at(-1)?.entries).toEqual([
                { kind: 'occurrence', occurrence: 'status-effect', data: { entity: 7n, change: 'add', effect } }
            ]);
        });

        it('hands the sink an occurrence made between ticks with the next tick', async () => {
            const { world, sealed } = await flatWorld();
            world.beginChangeTick();
            world.sealChangeTick();

            world.sendWorldEvent(null, LevelEvent.START_RAINING, 100);
            world.beginChangeTick();
            world.sealChangeTick();

            expect(sealed.at(-1)?.entries).toEqual([
                {
                    kind: 'occurrence',
                    occurrence: 'world-effect',
                    data: { position: null, effect: LevelEvent.START_RAINING, data: 100 }
                }
            ]);
        });

        it('refuses an occurrence at a position of another world', async () => {
            const { world, sealed } = await flatWorld();
            const { world: elsewhere } = await flatWorld();

            world.beginChangeTick();
            world.sendWorldEvent(new Position(1, GROUND, 1, elsewhere), LevelEvent.PARTICLES_CRIT, 0);
            world.sealChangeTick();

            expect(sealed.at(-1)?.entries).toEqual([]);
        });

        it('hands the sink the block entities of a chunk as it enters', async () => {
            const { world, entered } = await flatWorld();

            // The provider stocks chunk (1, 0) with a chest.
            await world.loadChunk(1, 0);

            expect(entered).toEqual([
                { x: 0, z: 0, blockEntities: 0 },
                { x: 1, z: 0, blockEntities: 1 }
            ]);
        });

        it('folds a block entity from its logged fields into the tags the block entity serializes to', async () => {
            const { world, replica } = await flatWorld();
            const at = { x: 3, y: GROUND + 1, z: 3 };

            world.beginChangeTick();
            writeBlockEntity(world, chestTags(at, { 0: ['minecraft:dirt', 4], 5: ['minecraft:stone', 9] }));
            world.sealChangeTick();
            world.beginChangeTick();
            writeBlockEntity(
                world,
                chestTags(at, { 0: ['minecraft:dirt', 4], 5: ['minecraft:stone', 9], 7: ['minecraft:glass', 1] })
            );
            world.sealChangeTick();

            const standing = world.getLoadedChunk(0, 0)?.getBlockEntity(at.x, at.y, at.z)?.toNBT();
            const folded = replica.compound(at);
            if (standing === undefined || folded === null) throw new Error('expected a chest on both sides');
            expect(bytesOf(folded)).toEqual(bytesOf(standing));
        });
    });
});
