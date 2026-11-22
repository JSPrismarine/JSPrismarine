/**
 * A chunk generated since the last pass and untouched by gameplay is written on its own (ADR 0018,
 * E1d): its terrain, and the mobs its generation left as its pending record, with no actor records
 * or digest. A pending record written before that, from a level record's legacy entities, still
 * reads as it did.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { Database } from '@jsprismarine/leveldb';
import type { WriteBatch } from '@jsprismarine/leveldb';
import type { Logger } from '@jsprismarine/logger';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { afterEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Server from '../../../Server';
import { stub } from '../../../testing/stub.test.helper';
import Chunk from '../../chunk/Chunk';
import { Dimensions } from '../../DimensionType';
import type { EntitySpawn } from '../../EntitySpawn';
import type { World } from '../../World';
import LevelDB from './LevelDB';
import { ChunkTag, encodeChunkKey, encodeDigestKey, encodePendingEntityKey } from './LevelDBKeys';

const directories: string[] = [];

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const stone = BlockRuntimeIds.getByName('minecraft:stone');

/** A provider over a fresh folder, with the pieces of the server and world it reads. */
const openProvider = async (): Promise<LevelDB> => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-fresh-chunk-'));
    directories.push(folder);
    const logger = stub<Logger>({
        warn: () => {},
        debug: () => {},
        verbose: () => {},
        info: () => {},
        error: () => {}
    });
    const server = stub<Server>({ getLogger: () => logger });
    const provider = new LevelDB(folder, server);
    provider.setWorld(
        stub<World>({
            getName: () => 'fresh',
            getSeed: () => 1234n,
            getDimension: () => Dimensions.Overworld,
            actors: () => [].values(),
            getServer: () => server
        })
    );
    await provider.enable();
    return provider;
};

/** Every key the database writes, in order. */
const watchKeys = (provider: LevelDB): Buffer[] => {
    const database: unknown = Reflect.get(provider, 'database');
    if (!(database instanceof Database)) throw new Error('The provider is not enabled');
    const keys: Buffer[] = [];
    const keysOf = (batch: WriteBatch) => batch.entries().map((operation) => operation.key);
    const write = database.write.bind(database);
    database.write = (batch, options) => {
        keys.push(...keysOf(batch));
        write(batch, options);
    };
    return keys;
};

/** A chunk with a stone floor, as a generator leaves one. */
const generated = (): Chunk => {
    const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, -64, -60, stone);
    return chunk;
};

/** A generator that must not be asked for anything. */
const noGeneration = {
    generateChunk: async (): Promise<Chunk> => {
        throw new Error('the chunk should have been read');
    }
};

/** A pending record in its first shape, as an older server wrote it, encoded as the provider stores NBT. */
const legacyPendingRecord = (entities: readonly unknown[]): Buffer => {
    const root = new NBTTagCompound('');
    root.addValue('Data', new Types.StringVal(JSON.stringify(entities)));
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(root);
    return stream.getBuffer();
};

const CRYSTAL: EntitySpawn = {
    type: 'minecraft:ender_crystal',
    x: 3.5,
    y: 76,
    z: 4.5,
    beamTarget: { x: 0, y: 128, z: 0 },
    showBottom: true,
    invulnerable: true
};

describe('a fresh chunk written on its own', () => {
    it('holds its terrain and its generation’s mobs as its pending record, with no actor record or digest', async () => {
        const provider = await openProvider();
        const keys = watchKeys(provider);
        const chunk = generated();

        const encoded = provider.writeFreshChunk(chunk, [CRYSTAL]);
        await provider.disable();

        expect(encoded).toBeGreaterThan(0);
        const has = (key: Buffer) => keys.some((each) => each.equals(key));
        expect(has(encodeChunkKey({ x: 0, z: 0, dimension: 0, tag: ChunkTag.SubChunkPrefix, subChunk: -4 }))).toBe(
            true
        );
        expect(has(encodePendingEntityKey(0, 0, 0))).toBe(true);
        expect(has(encodeDigestKey(0, 0, 0))).toBe(false);
    });

    it('reads back with its mobs to create as a generated chunk’s are, beam target and all', async () => {
        const provider = await openProvider();
        provider.writeFreshChunk(generated(), [CRYSTAL, { type: 'minecraft:villager', x: 1, y: 2, z: 3, yaw: 90 }]);

        const read = await provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, noGeneration);

        expect(read.getEntitySpawns()).toEqual([CRYSTAL, { type: 'minecraft:villager', x: 1, y: 2, z: 3, yaw: 90 }]);
        expect(read.takeStoredEntities()).toEqual([]);
        expect(read.getBlockRuntimeId(5, -64, 5)).toBe(stone);
        await provider.disable();
    });

    it('drops its pending record when a cut writes the chunk with its mobs live', async () => {
        const provider = await openProvider();
        const chunk = generated();
        provider.writeFreshChunk(chunk, [CRYSTAL]);
        const keys = watchKeys(provider);

        chunk.markChanged();
        await provider.writeChunk(chunk);
        await provider.disable();

        // The cut deletes it in the same batch that writes the actor records.
        expect(keys.some((key) => key.equals(encodePendingEntityKey(0, 0, 0)))).toBe(true);
        const reopened = await openProviderAt(provider);
        const read = await reopened.readChunk(Dimensions.Overworld, 0, 0, 1234n, noGeneration);
        expect(read.getEntitySpawns()).toEqual([]);
        await reopened.disable();
    });
});

describe('a pending record of the first shape', () => {
    it('reads as the stored actors it named, as before', async () => {
        const provider = await openProvider();
        const database: unknown = Reflect.get(provider, 'database');
        if (!(database instanceof Database)) throw new Error('The provider is not enabled');
        database.put(
            encodePendingEntityKey(0, 0, 0),
            legacyPendingRecord([{ uniqueId: '7', type: 'minecraft:cow', position: { x: 1, y: 2, z: 3 } }])
        );

        const read = await provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, {
            generateChunk: async () => generated()
        });

        const stored = read.takeStoredEntities();
        expect(stored.map((nbt) => nbt.getString('identifier', ''))).toEqual(['minecraft:cow']);
        expect(read.getEntitySpawns()).toEqual([]);
        await provider.disable();
    });
});

/** A second provider over the same folder as one that was closed. */
const openProviderAt = async (closed: LevelDB): Promise<LevelDB> => {
    const folder: unknown = Reflect.get(closed, 'path');
    if (typeof folder !== 'string') throw new Error('The provider has no folder');
    const logger = stub<Logger>({
        warn: () => {},
        debug: () => {},
        verbose: () => {},
        info: () => {},
        error: () => {}
    });
    const server = stub<Server>({ getLogger: () => logger });
    const provider = new LevelDB(folder, server);
    provider.setWorld(
        stub<World>({
            getName: () => 'fresh',
            getSeed: () => 1234n,
            getDimension: () => Dimensions.Overworld,
            actors: () => [].values(),
            getServer: () => server
        })
    );
    await provider.enable();
    return provider;
};
