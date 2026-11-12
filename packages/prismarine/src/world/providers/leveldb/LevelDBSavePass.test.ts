import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Database } from '@jsprismarine/leveldb';
import type { WriteBatch } from '@jsprismarine/leveldb';
import type { Logger } from '@jsprismarine/logger';
import { afterEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Server from '../../../Server';
import { stub } from '../../../testing/stub.test.helper';
import Chunk from '../../chunk/Chunk';
import { Dimensions } from '../../DimensionType';
import type { World } from '../../World';
import { createChunkSaveContext } from '../ChunkSaveContext';
import LevelDB from './LevelDB';

/**
 * A LevelDB save pass (ADR 0018), counted in batches, keys and encodes. None of it is timed.
 */

const directories: string[] = [];
const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-save-pass-'));
    directories.push(directory);
    return directory;
};
afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const errors: string[] = [];
const provider = (worldPath: string): LevelDB => {
    const logger = stub<Logger>({
        warn: () => {},
        debug: () => {},
        verbose: () => {},
        info: () => {},
        error: (message: string) => {
            errors.push(message);
        }
    });
    const server = stub<Server>({ getLogger: () => logger });
    const leveldb = new LevelDB(worldPath, server);
    leveldb.setWorld(
        stub<World>({
            getName: () => 'pass',
            getSeed: () => 1n,
            getDimension: () => Dimensions.Overworld,
            actors: () => [].values(),
            getServer: () => server
        })
    );
    return leveldb;
};

/** Counts the batches the provider's database commits and the keys in them. */
const countCommits = (leveldb: LevelDB): { batches: number; keys: number } => {
    const database: unknown = Reflect.get(leveldb, 'database');
    if (!(database instanceof Database)) throw new Error('The provider is not enabled');
    const counted = { batches: 0, keys: 0 };
    const commit = database.commit.bind(database);
    database.commit = async (batch: WriteBatch, options) => {
        counted.batches++;
        counted.keys += batch.count;
        await commit(batch, options);
    };
    return counted;
};

const stone = BlockRuntimeIds.getByName('minecraft:stone');
const gold = BlockRuntimeIds.getByName('minecraft:gold_block');
const air = BlockRuntimeIds.getByName('minecraft:air');

/** A chunk with stone in two sections, so its cut holds back two sub chunks. */
const twoSectionChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
    chunk.setBlockRuntimeId(0, 0, 0, stone);
    chunk.setBlockRuntimeId(0, 16, 0, stone);
    return chunk;
};

const context = () => createChunkSaveContext(Dimensions.Overworld.bedrockId, [], () => 0);

const readBack = async (leveldb: LevelDB, x: number, z: number): Promise<Chunk> =>
    leveldb.readChunk(Dimensions.Overworld, x, z, 1n, {
        generateChunk: async () => {
            throw new Error(`chunk ${x},${z} was not saved`);
        }
    });

describe('a LevelDB save pass', () => {
    it('commits every chunk of a pass in one batch', async () => {
        const leveldb = provider(scratch());
        await leveldb.enable();
        const commits = countCommits(leveldb);

        const pass = leveldb.beginSavePass();
        for (let x = 0; x < 3; x++) pass.cutChunk(twoSectionChunk(x, 0), context());
        expect(pass.pendingEncodes).toBe(6);
        expect(pass.encode(4)).toBe(4);
        expect(pass.pendingEncodes).toBe(2);
        await pass.commit({ sync: true });

        expect(commits.batches).toBe(1);
        // Per chunk: two sub chunks, Data3D, Version and FinalizedState.
        expect(commits.keys).toBe(15);
        expect(pass.stats.subChunkEncodes).toBe(6);
        expect(pass.stats.forcedSubChunkEncodes).toBe(0);
        await leveldb.disable();
    });

    it('saves a chunk as it was at the cut, encoding one sub chunk early for a write after it', async () => {
        const worldPath = scratch();
        const leveldb = provider(worldPath);
        await leveldb.enable();
        const chunk = twoSectionChunk(0, 0);

        const pass = leveldb.beginSavePass();
        pass.cutChunk(chunk, context());
        chunk.setBlockRuntimeId(1, 0, 0, gold);

        // The write reached section 0, so section 0 and the height and biome record were encoded
        // before it; section 1 waits for its turn.
        expect(pass.stats.forcedSubChunkEncodes).toBe(1);
        expect(pass.stats.subChunkEncodes).toBe(1);
        expect(pass.pendingEncodes).toBe(1);
        await pass.commit({ sync: false });

        expect(pass.stats.bypassedWrites).toBe(0);
        expect(chunk.getHasChanged()).toBe(true);
        expect(chunk.getPersistenceChanges().subChunks.map(({ index }) => index)).toEqual([0]);
        await leveldb.disable();

        const reopened = provider(worldPath);
        await reopened.enable();
        const saved = await readBack(reopened, 0, 0);
        expect(saved.getBlockRuntimeId(0, 0, 0)).toBe(stone);
        expect(saved.getBlockRuntimeId(1, 0, 0)).toBe(air);
        await reopened.disable();
    });

    it('writes nothing for a chunk that has not changed since the last pass', async () => {
        const leveldb = provider(scratch());
        await leveldb.enable();
        const chunk = twoSectionChunk(0, 0);
        const first = leveldb.beginSavePass();
        first.cutChunk(chunk, context());
        await first.commit({ sync: false });
        const commits = countCommits(leveldb);

        const second = leveldb.beginSavePass();
        second.cutChunk(chunk, context());
        await second.commit({ sync: false });

        expect(second.stats.keys).toBe(0);
        expect(commits.batches).toBe(0);
        await leveldb.disable();
    });

    it('leaves the previous save whole when a crash cuts its commit short', async () => {
        const worldPath = scratch();
        const leveldb = provider(worldPath);
        await leveldb.enable();
        const chunks = Array.from({ length: 16 }, (_, x) => twoSectionChunk(x, 0));
        const first = leveldb.beginSavePass();
        for (const chunk of chunks) first.cutChunk(chunk, context());
        await first.commit({ sync: true });

        // Gold in every section of every chunk, so the second pass rewrites all of them.
        for (const chunk of chunks) {
            for (let x = 0; x < 16; x++) {
                chunk.setBlockRuntimeId(x, 0, 0, gold);
                chunk.setBlockRuntimeId(x, 16, 0, gold);
            }
        }
        const second = leveldb.beginSavePass();
        for (const chunk of chunks) second.cutChunk(chunk, context());
        await second.commit({ sync: true });

        const copy = scratch();
        const db = path.join(worldPath, 'db');
        fs.mkdirSync(path.join(copy, 'db'));
        for (const name of fs.readdirSync(worldPath)) {
            if (name !== 'db') fs.copyFileSync(path.join(worldPath, name), path.join(copy, name));
        }
        for (const name of fs.readdirSync(db)) {
            if (name !== 'LOCK') fs.copyFileSync(path.join(db, name), path.join(copy, 'db', name));
        }
        // The second pass is the log's last record. Keep the first pass and half of the second.
        const log = fs.readdirSync(path.join(copy, 'db')).find((name) => name.endsWith('.log'))!;
        const bytes = fs.readFileSync(path.join(copy, 'db', log));
        const secondPassBytes = second.stats.bytes;
        fs.writeFileSync(
            path.join(copy, 'db', log),
            bytes.subarray(0, bytes.byteLength - Math.floor(secondPassBytes / 2))
        );
        await leveldb.disable();

        const reopened = provider(copy);
        await reopened.enable();
        for (let x = 0; x < chunks.length; x++) {
            const saved = await readBack(reopened, x, 0);
            expect(saved.getBlockRuntimeId(0, 0, 0)).toBe(stone);
            expect(saved.getBlockRuntimeId(1, 16, 0)).toBe(air);
        }
        await reopened.disable();
    });
});
