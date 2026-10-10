import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { afterEach, describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from '../../../blockentity/BlockEntityRegistry';
import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import { ChunkTag, encodeChunkKey } from './LevelDBKeys';
import { Database } from '@jsprismarine/leveldb';
import { decodeLevelDat } from './LevelDat';
import { Dimensions } from '../../Dimension';
import Chunk from '../../chunk/Chunk';
import LevelDB, { CHUNK_VERSION } from './LevelDB';

const directories: string[] = [];

const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-'));
    directories.push(directory);
    return directory;
};

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const id = (name: string) => BlockRuntimeIds.getByName(name);

/**
 * The pieces of `Server` and `World` a provider touches. Hand-rolled rather than mocked, so what
 * the provider actually depends on stays visible.
 */
const harness = (worldPath: string, name = 'testworld') => {
    const warnings: string[] = [];
    const server = {
        getLogger: () => ({
            warn: (message: string) => warnings.push(message),
            debug: () => {},
            verbose: () => {},
            info: () => {},
            error: () => {}
        })
    };

    const world = {
        getName: () => name,
        getSeed: () => 1234,
        getDimension: () => Dimensions.Overworld,
        getServer: () => server
    };

    const provider = new LevelDB(worldPath, server as never);
    provider.setWorld(world as never);
    return { provider, warnings };
};

/** A generator stand-in that records whether it was asked for anything. */
const generator = (calls: Array<[number, number]> = []) => ({
    calls,
    generateChunk: async (cx: number, cz: number) => {
        calls.push([cx, cz]);
        return new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    }
});

const buildChunk = (cx = 0, cz = 0): Chunk => {
    const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, -60, id('minecraft:stone'));
        }
    }

    chunk.setBlockRuntimeId(3, -64, 4, id('minecraft:bedrock'));
    chunk.setBlockRuntimeId(8, 70, 9, id('minecraft:oak_log'));
    chunk.setBlockRuntimeId(1, 310, 1, id('minecraft:dirt'));
    return chunk;
};

describe('world', () => {
    describe('LevelDB provider', () => {
        it('creates a world folder shaped the way the game expects', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath, 'MyWorld');
            await provider.enable();
            await provider.disable();

            expect(fs.existsSync(path.join(worldPath, 'db'))).toBe(true);
            expect(fs.existsSync(path.join(worldPath, 'db', 'CURRENT'))).toBe(true);
            expect(fs.existsSync(path.join(worldPath, 'level.dat'))).toBe(true);
            expect(fs.readFileSync(path.join(worldPath, 'levelname.txt'), 'utf8')).toBe('MyWorld');
        });

        it('writes a level.dat the game can read', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath, 'MyWorld');
            await provider.enable();
            await provider.disable();

            const level = decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat')));

            expect(level.storageVersion).toBe(10);
            expect(level.root.getString('LevelName', '')).toBe('MyWorld');
            expect(level.root.getLong('RandomSeed', 0n)).toBe(1234n);
        });

        it('generates a chunk that is not there, and does not write one back for it', async () => {
            const { provider } = harness(scratch());
            await provider.enable();

            const gen = generator();
            const chunk = await provider.readChunk(0, 0, 1234, gen as never);

            expect(gen.calls).toEqual([[0, 0]]);
            expect(chunk.getHasChanged()).toBe(false);
            await provider.disable();
        });

        describe('round trip', () => {
            it('reads back every block it wrote, across the full height', async () => {
                const worldPath = scratch();
                const first = harness(worldPath);
                await first.provider.enable();
                await first.provider.writeChunk(buildChunk());
                await first.provider.disable();

                const second = harness(worldPath);
                await second.provider.enable();
                const gen = generator();
                const restored = await second.provider.readChunk(0, 0, 1234, gen as never);

                // Not regenerated: the chunk was found on disk.
                expect(gen.calls).toEqual([]);

                expect(restored.getBlockRuntimeId(3, -64, 4)).toBe(id('minecraft:bedrock'));
                expect(restored.getBlockRuntimeId(0, -62, 0)).toBe(id('minecraft:stone'));
                expect(restored.getBlockRuntimeId(8, 70, 9)).toBe(id('minecraft:oak_log'));
                expect(restored.getBlockRuntimeId(1, 310, 1)).toBe(id('minecraft:dirt'));
                expect(restored.getBlockRuntimeId(5, 200, 5)).toBe(id('minecraft:air'));
                await second.provider.disable();
            });

            it('keeps a block at y=-64 and one at y=310, which the old format could not hold', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(buildChunk());
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(0, 0, 1234, generator() as never);

                expect(restored.getMinY()).toBe(-64);
                expect(restored.getMaxY()).toBe(319);
                expect(restored.getBlockRuntimeId(3, -64, 4)).not.toBe(id('minecraft:air'));
                expect(restored.getBlockRuntimeId(1, 310, 1)).not.toBe(id('minecraft:air'));
                await reopened.provider.disable();
            });

            it('round-trips several chunks', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                for (let cx = -2; cx <= 2; cx++) {
                    for (let cz = -2; cz <= 2; cz++) await provider.writeChunk(buildChunk(cx, cz));
                }

                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();

                for (let cx = -2; cx <= 2; cx++) {
                    for (let cz = -2; cz <= 2; cz++) {
                        const restored = await reopened.provider.readChunk(cx, cz, 1234, generator() as never);
                        expect(restored.getBlockRuntimeId(3, -64, 4)).toBe(id('minecraft:bedrock'));
                    }
                }

                await reopened.provider.disable();
            });

            it('round-trips block entities, including one it does not model', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                const chunk = buildChunk();
                for (const [id_, x, y, z, extra] of [
                    ['Chest', 1, 64, 1, (root: NBTTagCompound) => root.addValue('Findable', new Types.ByteVal(1))],
                    ['Beacon', 2, 64, 2, (root: NBTTagCompound) => root.addValue('primary', new Types.NumberVal(5))]
                ] as Array<[string, number, number, number, (root: NBTTagCompound) => void]>) {
                    const nbt = new NBTTagCompound('');
                    nbt.addValue('id', new Types.StringVal(id_));
                    nbt.addValue('x', new Types.NumberVal(x));
                    nbt.addValue('y', new Types.NumberVal(y));
                    nbt.addValue('z', new Types.NumberVal(z));
                    extra(nbt);
                    chunk.setBlockEntity(BlockEntityRegistry.fromNBT(nbt));
                }

                await provider.writeChunk(chunk);
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(0, 0, 1234, generator() as never);

                const chest = restored.getBlockEntity(1, 64, 1);
                const beacon = restored.getBlockEntity(2, 64, 2);

                expect(chest?.getId()).toBe('Chest');
                expect(beacon?.getId()).toBe('Beacon');
                // The unmodelled one kept its own fields.
                expect(beacon?.toNBT().getNumber('primary', 0)).toBe(5);
                await reopened.provider.disable();
            });
        });

        describe('what it stores', () => {
            it('writes the records a vanilla chunk has', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(buildChunk());
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const key = (tag: ChunkTag, subChunk?: number) =>
                    encodeChunkKey({ x: 0, z: 0, dimension: 0, tag, subChunk });

                expect(database.get(key(ChunkTag.Version))).toEqual(Buffer.from([CHUNK_VERSION]));
                expect(database.get(key(ChunkTag.FinalizedState))?.readInt32LE(0)).toBe(2);
                expect(database.get(key(ChunkTag.Data3D))).not.toBeNull();
                // Sub chunk -4 holds the stone floor; 12 is empty and must not be stored.
                expect(database.get(key(ChunkTag.SubChunkPrefix, -4))).not.toBeNull();
                expect(database.get(key(ChunkTag.SubChunkPrefix, 12))).toBeNull();
                await database.close();
            });

            it('does not store an all-air sub chunk', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
                chunk.setBlockRuntimeId(0, 0, 0, id('minecraft:stone'));
                await provider.writeChunk(chunk);
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const subChunks = [...database.keys()].filter((key) => key.byteLength === 10);

                expect(subChunks).toHaveLength(1);
                await database.close();
            });

            it('marks a written chunk as saved so it is not written again', async () => {
                const { provider } = harness(scratch());
                await provider.enable();

                const chunk = buildChunk();
                expect(chunk.getHasChanged()).toBe(true);

                await provider.writeChunk(chunk);
                expect(chunk.getHasChanged()).toBe(false);
                await provider.disable();
            });
        });

        describe('safety', () => {
            it('warns rather than silently starting empty over an old Filesystem world', async () => {
                const worldPath = scratch();
                fs.mkdirSync(path.join(worldPath, 'chunks'));
                fs.writeFileSync(path.join(worldPath, 'chunks', '0_0.dat'), 'old world data');

                const { provider, warnings } = harness(worldPath);
                await provider.enable();
                await provider.disable();

                expect(warnings.join('\n')).toMatch(/Filesystem world/);
                // Nothing was destroyed.
                expect(fs.readFileSync(path.join(worldPath, 'chunks', '0_0.dat'), 'utf8')).toBe('old world data');
            });

            it('refuses a second provider on the same folder', async () => {
                const worldPath = scratch();
                const first = harness(worldPath);
                await first.provider.enable();

                const second = harness(worldPath);
                await expect(second.provider.enable()).rejects.toThrow(/already open/);
                await first.provider.disable();
            });
        });
    });
});
