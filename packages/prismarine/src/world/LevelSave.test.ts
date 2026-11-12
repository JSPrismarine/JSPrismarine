import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Database } from '@jsprismarine/leveldb';
import type { WriteBatch } from '@jsprismarine/leveldb';
import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Config } from '../config/Config';
import type { WorldPlayerData } from '../config/JsonConfigTypes';
import type Server from '../Server';
import { inertEntityRuntime, liveTestEntities, testContent } from '../testing/entityServer';
import { testLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { ChunkCompletionQueue } from './ChunkCompletionQueue';
import { subChunkCount } from './Dimension';
import { Dimensions } from './DimensionType';
import type { DimensionType } from './DimensionType';
import type { Generator } from './Generator';
import type { Level } from './Level';
import { AUTO_SAVE_INTERVAL_TICKS, HELD_WRITE_LIMIT, SAVE_ENCODE_BUDGET } from './LevelSave';
import { DimensionTravel } from './portal/DimensionTravel';
import { decodeChunkKey, encodePlayerServerKey } from './providers/leveldb/LevelDBKeys';
import LevelDB from './providers/leveldb/LevelDB';
import type { ProviderSavePass } from './providers/SavePass';
import type { World } from './World';

/**
 * A level's save pass under ADR 0018, counted in batches, keys, encodes and bytes. Nothing here
 * is timed: a tick is one call, and what a pass holds is read from the pass and the database.
 */

const stone = BlockRuntimeIds.getByName('minecraft:stone');
const gold = BlockRuntimeIds.getByName('minecraft:gold_block');

/** Chunks loaded in each dimension. */
const CHUNKS = 4;

/** Stone from the floor to the ceiling, so each chunk has a section for every level of its dimension. */
const filledGenerator = (dimension: DimensionType): Generator => ({
    generateChunk: async (cx: number, cz: number) => {
        const chunk = new Chunk(cx, cz, new Map(), dimension);
        for (let x = 0; x < 16; x++)
            for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, chunk.getMinY(), chunk.getMaxY(), stone);
        return chunk;
    }
});

let scratch: string;
let previousDirectory: string | undefined;

beforeEach(() => {
    previousDirectory = process.env.JSP_DIR;
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-level-save-'));
    process.env.JSP_DIR = scratch;
});

afterEach(() => {
    if (previousDirectory === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDirectory;
    fs.rmSync(scratch, { recursive: true, force: true });
});

const testServer = (): Server => {
    const server: Server = stub<Server>({
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getChunkCompletionQueue: () => new ChunkCompletionQueue(),
        getEntityRuntime: () => inertEntityRuntime(),
        getRandom: () => () => 0.5,
        getDimensionTravel: () => new DimensionTravel(server)
    });
    return server;
};

/** Every batch the database writes, by the call that wrote it, with its keys. */
interface Written {
    readonly call: 'write' | 'commit';
    readonly keys: readonly Buffer[];
}

const watchDatabase = (provider: LevelDB): Written[] => {
    const database: unknown = Reflect.get(provider, 'database');
    if (!(database instanceof Database)) throw new Error('The provider is not enabled');
    const written: Written[] = [];
    const keysOf = (batch: WriteBatch) => batch.entries().map((operation) => operation.key);
    const write = database.write.bind(database);
    const commit = database.commit.bind(database);
    database.write = (batch, options) => {
        if (batch.count > 0) written.push({ call: 'write', keys: keysOf(batch) });
        write(batch, options);
    };
    database.commit = async (batch, options) => {
        if (batch.count > 0) written.push({ call: 'commit', keys: keysOf(batch) });
        await commit(batch, options);
    };
    return written;
};

/** Hands each save pass the level starts to the test as well. */
const watchPasses = (provider: LevelDB): ProviderSavePass[] => {
    const passes: ProviderSavePass[] = [];
    const begin = provider.beginSavePass.bind(provider);
    provider.beginSavePass = () => {
        const pass = begin();
        passes.push(pass);
        return pass;
    };
    return passes;
};

interface Harness {
    readonly folder: string;
    readonly level: Level;
    readonly provider: LevelDB;
    readonly overworld: World;
    readonly nether: World;
    readonly server: Server;
}

const harness = async (name: string): Promise<Harness> => {
    const server = testServer();
    const folder = path.join(scratch, 'worlds', name);
    const provider = new LevelDB(folder, server);
    const level = testLevel({
        name,
        path: folder,
        server,
        provider,
        generator: filledGenerator(Dimensions.Overworld),
        nether: filledGenerator(Dimensions.Nether),
        spawn: new Vector3(0, 320, 0)
    });
    await level.enable();
    const overworld = await level.world(OVERWORLD_STEM_ID);
    const nether = await level.world(Dimensions.Nether.id);
    for (let x = 0; x < CHUNKS; x++) {
        await overworld.getChunk(x, 0);
        await nether.getChunk(x, 0);
    }
    return { folder, level, provider, overworld, nether, server };
};

/** Takes the autosave's cut at the end of the level's tick, as the ticker would. */
const cutAutosave = (level: Level): number => {
    level.setTicks(AUTO_SAVE_INTERVAL_TICKS - 1);
    level.update(AUTO_SAVE_INTERVAL_TICKS);
    return AUTO_SAVE_INTERVAL_TICKS;
};

/** Every block of a chunk's first layer, in a fixed order. */
const blocksOf = (chunk: Chunk): number[] => {
    const blocks: number[] = [];
    for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y += 4)
        for (let x = 0; x < 16; x += 3) for (let z = 0; z < 16; z += 3) blocks.push(chunk.getBlockRuntimeId(x, y, z));
    return blocks;
};

/** The chunk a provider's save holds. */
const readSaved = async (provider: LevelDB, dimension: DimensionType, x: number): Promise<Chunk> =>
    provider.readChunk(dimension, x, 0, 1234n, {
        generateChunk: async () => {
            throw new Error(`chunk ${x},0 of ${dimension.id} was not saved`);
        }
    });

/** The chunk the save in a closed level's folder holds, read from a database of its own. */
const savedChunk = async (folder: string, server: Server, dimension: DimensionType, x: number): Promise<Chunk> => {
    const reader = new LevelDB(folder, server);
    reader.setLevel({ name: 'reader', seed: 1234n });
    await reader.enable();
    try {
        return await readSaved(reader, dimension, x);
    } finally {
        await reader.disable();
    }
};

/** A copy of the level folder as a crash would leave it: every file, and no lock. */
const crashCopy = (folder: string): string => {
    const copy = path.join(scratch, `crashed-${path.basename(folder)}`);
    fs.cpSync(folder, copy, { recursive: true, filter: (source) => path.basename(source) !== 'LOCK' });
    return copy;
};

describe('a level save pass', () => {
    it('commits every dimension of the level in one batch, outside the tick that cut it', async () => {
        const { level, provider } = await harness('one-batch');
        const written = watchDatabase(provider);
        const passes = watchPasses(provider);

        let tick = cutAutosave(level);
        expect(passes).toHaveLength(1);
        const [pass] = passes;
        // Each tick encodes its share and returns; nothing reached the database in a tick.
        while (pass!.pendingEncodes > 0) {
            expect(pass!.pendingEncodes).toBeGreaterThan(0);
            level.update(++tick);
            expect(written).toEqual([]);
        }
        // Settles once the autosave's commit has landed.
        await level.pendingSave();

        expect(written.map(({ call }) => call)).toEqual(['commit']);
        const dimensions = new Set(
            written[0]!.keys.map((key) => decodeChunkKey(key)?.dimension).filter((id) => id !== undefined)
        );
        expect([...dimensions].sort()).toEqual([Dimensions.Overworld.bedrockId, Dimensions.Nether.bedrockId].sort());
        // Overworld sections plus Nether sections, encoded a budget a tick.
        const sections = CHUNKS * (subChunkCount(Dimensions.Overworld) + subChunkCount(Dimensions.Nether));
        expect(pass!.stats.subChunkEncodes).toBe(sections);
        expect(tick - AUTO_SAVE_INTERVAL_TICKS).toBe(Math.ceil(sections / SAVE_ENCODE_BUDGET) - 1);
        reportProgress(
            `One pass over ${CHUNKS * 2} fresh chunks in two dimensions: ${pass!.stats.keys} keys, ${pass!.stats.bytes} bytes`,
            'Save pass bytes'
        );
        await level.disable();
    });

    it('keeps a write after the cut out of its commit, encoding one sub chunk early for it', async () => {
        const { level, overworld, provider } = await harness('after-cut');
        const passes = watchPasses(provider);
        let tick = cutAutosave(level);
        const pass = passes[0]!;
        // The last chunk is still waiting for its turn after the cut tick's share.
        const last = overworld.getLoadedChunk(CHUNKS - 1, 0)!;
        const encodesBefore = pass.stats.subChunkEncodes;

        last.setBlockRuntimeId(5, 0, 5, gold);

        expect(pass.stats.forcedSubChunkEncodes).toBe(1);
        expect(pass.stats.subChunkEncodes - encodesBefore).toBe(1);
        expect(pass.stats.bypassedWrites).toBe(0);
        while (pass.pendingEncodes > 0) level.update(++tick);
        // Settles once the autosave's commit has landed. An explicit save would be a pass of its
        // own, cut after the write.
        await level.pendingSave();

        const saved = await readSaved(provider, Dimensions.Overworld, CHUNKS - 1);
        expect(saved.getBlockRuntimeId(5, 0, 5)).toBe(stone);
        expect(last.getBlockRuntimeId(5, 0, 5)).toBe(gold);
        expect(last.getHasChanged()).toBe(true);
        await level.disable();
    });

    it('saves each chunk as it was at the cut tick, whatever the ticks after it write', async () => {
        const { level, overworld, nether, provider } = await harness('cut-state');
        const atCut = new Map<string, number[]>();
        let tick = cutAutosave(level);
        for (const world of [overworld, nether])
            for (let x = 0; x < CHUNKS; x++)
                atCut.set(`${world.getDimension().id} ${x}`, blocksOf(world.getLoadedChunk(x, 0)!));

        // Every tick after the cut writes gold into every chunk, whether the pass has encoded it or not.
        for (let step = 0; step < 4; step++) {
            for (const world of [overworld, nether])
                for (let x = 0; x < CHUNKS; x++) world.getLoadedChunk(x, 0)!.setBlockRuntimeId(step * 3, 64, 0, gold);
            level.update(++tick);
        }
        await level.pendingSave();

        for (const world of [overworld, nether]) {
            for (let x = 0; x < CHUNKS; x++) {
                const saved = await readSaved(provider, world.getDimension(), x);
                expect(blocksOf(saved), `${world.getDimension().id} ${x}`).toEqual(
                    atCut.get(`${world.getDimension().id} ${x}`)
                );
            }
        }
        await level.disable();
    });

    it('sees every block the world writes during a pass before it lands', async () => {
        const { level, overworld, nether, provider } = await harness('gameplay-writes');
        const passes = watchPasses(provider);
        let tick = cutAutosave(level);
        const pass = passes[0]!;

        // Through the world, as gameplay writes, with the neighbor updates the next tick runs.
        for (let step = 0; pass.pendingEncodes > 0; step++) {
            for (const world of [overworld, nether])
                for (let x = 0; x < CHUNKS; x++) world.setBlockRuntimeId(x * 16 + (step % 16), 64, 0, gold);
            level.update(++tick);
        }
        await level.enqueueSave(async () => {});

        expect(pass.stats.forcedSubChunkEncodes).toBeGreaterThan(0);
        expect(passes.map(({ stats }) => stats.bypassedWrites)).toEqual(passes.map(() => 0));
        await level.disable();
    });

    it('saves the entities a chunk held at the cut, not the ones it holds at the commit', async () => {
        const { folder, level, overworld, provider, server } = await harness('cut-entities');
        const live = liveTestEntities(() => overworld).entityRuntime(Dimensions.Overworld.name);
        Reflect.set(server, 'getEntityRuntime', () => live);
        const cow = live.runtime.spawn('minecraft:cow', { x: 0.5, y: 320, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        const passes = watchPasses(provider);

        let tick = cutAutosave(level);
        live.runtime.remove(cow.id, 'test');
        while (passes[0]!.pendingEncodes > 0) level.update(++tick);
        // Settles once the autosave's commit has landed.
        await level.pendingSave();

        const atCut = await readSaved(provider, Dimensions.Overworld, 0);
        expect(atCut.takeStoredEntities().map((actor) => actor.getString('identifier', ''))).toEqual(['minecraft:cow']);

        // The next pass is cut after the removal.
        await level.save();
        await level.disable();
        const after = await savedChunk(folder, server, Dimensions.Overworld, 0);
        expect(after.takeStoredEntities()).toEqual([]);
    });

    it('leaves the previous save whole when the process dies between the cut and the commit', async () => {
        const { folder, level, overworld, server } = await harness('crash');
        await level.save();
        const before = blocksOf(overworld.getLoadedChunk(0, 0)!);

        overworld.getLoadedChunk(0, 0)!.setBlockRuntimeId(0, 0, 0, gold);
        cutAutosave(level);
        // The cut is taken and its commit has not started: what a crash now leaves on disk.
        const crashed = crashCopy(folder);
        await level.disable();

        const saved = await savedChunk(crashed, server, Dimensions.Overworld, 0);
        expect(blocksOf(saved)).toEqual(before);
    });

    it('writes nothing for a level where nothing happened since the last pass', async () => {
        const { level, provider } = await harness('idle');
        await level.save();
        const written = watchDatabase(provider);

        await level.save();
        expect(written).toEqual([]);

        // Idle ticks move only the level's own clock and weather, never a chunk, actor or player key.
        for (let tick = 1; tick <= 20; tick++) level.update(tick);
        await level.save();
        const keys = written.flatMap(({ keys }) => keys).map((key) => key.toString('latin1'));
        expect(keys.filter((key) => !key.startsWith('jsprismarine:world_data'))).toEqual([]);
        await level.disable();
    });
});

/** A player's record as a disconnect writes it, standing at `x`. */
const leftAt = (name: string, x: number): WorldPlayerData => ({
    uuid: `${name}-uuid`,
    username: name,
    gamemode: 'Survival',
    position: { x, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 }
});

/** Whether a batch holds `key`. */
const holds = (written: Written, key: Buffer): boolean => written.keys.some((each) => each.equals(key));

/** The chunk x coordinates of the Overworld chunk keys a batch holds. */
const overworldChunksIn = (written: Written): number[] =>
    [
        ...new Set(
            written.keys
                .map((key) => decodeChunkKey(key))
                .filter((decoded) => decoded !== null && decoded.dimension === Dimensions.Overworld.bedrockId)
                .map((decoded) => decoded!.x)
        )
    ].sort();

/** Writes gold into a loaded Overworld chunk and unloads it, as the unload pass would. */
const changeAndUnload = async (overworld: World, x: number): Promise<void> => {
    overworld.getLoadedChunk(x, 0)!.setBlockRuntimeId(1, 10, 1, gold);
    await overworld['unloadChunks']([overworld.getLoadedChunk(x, 0)!]);
    if (overworld.getLoadedChunk(x, 0) !== null) throw new Error(`chunk ${x},0 did not leave`);
};

describe('a write outside a pass', () => {
    it('lands in the commit after the one whose cut it followed, which is still one batch', async () => {
        const { level, provider } = await harness('after-cut-disconnect');
        await level.save();
        const written = watchDatabase(provider);
        const passes = watchPasses(provider);

        let tick = cutAutosave(level);
        await level.savePlayerData('late', leftAt('late', 5));
        while (passes[0]!.pendingEncodes > 0) level.update(++tick);
        await level.pendingSave();
        await level.save();

        const key = encodePlayerServerKey('late');
        expect(written.map(({ call }) => call)).toEqual(['commit', 'commit']);
        expect(holds(written[0]!, key)).toBe(false);
        expect(holds(written[1]!, key)).toBe(true);
        expect(passes[0]!.stats.heldWrites).toBe(0);
        expect(passes[1]!.stats.heldWrites).toBe(1);
        await level.disable();
    });

    it('answers a rejoin before the next pass with the record the player left with, writing nothing', async () => {
        const { level, provider } = await harness('rejoin');
        await level.save();
        const written = watchDatabase(provider);

        await level.savePlayerData('leaver', leftAt('leaver', 12.5));
        const rejoined = await level.getPlayerData('leaver');

        expect(rejoined?.position?.x).toBe(12.5);
        expect(written).toEqual([]);
        expect(provider.heldWriteBytes()).toBeGreaterThan(0);
        await level.disable();
    });

    it('reloads an unloaded chunk before the next pass with the content it left with, writing nothing', async () => {
        const { level, overworld, provider } = await harness('reload');
        await level.save();
        const written = watchDatabase(provider);

        await changeAndUnload(overworld, 1);
        const reloaded = await overworld.getChunk(1, 0);

        expect(reloaded.getBlockRuntimeId(1, 10, 1)).toBe(gold);
        expect(written).toEqual([]);
        await level.disable();
    });

    it('joins the next pass with every unload and disconnect since the last, in one batch', async () => {
        const { level, overworld, provider } = await harness('many');
        await level.save();
        const written = watchDatabase(provider);
        const passes = watchPasses(provider);

        const unloaded = [0, 2, 3];
        for (const x of unloaded) await changeAndUnload(overworld, x);
        const leavers = ['first', 'second'];
        for (const [index, name] of leavers.entries()) await level.savePlayerData(name, leftAt(name, index));
        expect(written).toEqual([]);

        await level.save();

        expect(written.map(({ call }) => call)).toEqual(['commit']);
        expect(overworldChunksIn(written[0]!)).toEqual(unloaded);
        for (const name of leavers) expect(holds(written[0]!, encodePlayerServerKey(name))).toBe(true);
        // One sub chunk and the Data3D record of each unloaded chunk, and each player's record.
        expect(passes[0]!.stats.heldWrites).toBe(unloaded.length * 2 + leavers.length);
        expect(provider.heldWriteBytes()).toBe(0);
        await level.disable();
    });

    it('commits early, in one batch of its own, once the held bytes pass the limit', async () => {
        const { level, provider } = await harness('limit');
        await level.save();
        const written = watchDatabase(provider);
        // Every advancement done, which makes a record of about 10 KB.
        const advancements = Object.fromEntries(
            Array.from({ length: 120 }, (_, index) => [
                `minecraft:story/advancement_${index}`,
                { criteria: { done: '2026-11-12T00:00:00.000Z' }, done: true }
            ])
        );
        let leavers = 0;
        const leave = async () => {
            const name = `player-${leavers++}`;
            await level.savePlayerData(name, { ...leftAt(name, leavers), advancements });
        };

        // Under the limit: a tick commits nothing, and the next pass carries every record.
        for (let index = 0; index < 8; index++) await leave();
        expect(provider.heldWriteBytes()).toBeLessThanOrEqual(HELD_WRITE_LIMIT);
        level.update(1);
        await level.save();
        expect(written).toHaveLength(1);
        expect(written[0]!.keys.filter((key) => key.toString('latin1').startsWith('player_server_'))).toHaveLength(8);

        // Over it: the next tick commits the held records alone, before any pass.
        const first = leavers;
        while (provider.heldWriteBytes() <= HELD_WRITE_LIMIT) await leave();
        const records = leavers - first;
        const held = provider.heldWriteBytes();
        level.update(2);
        await level.save();

        expect(written).toHaveLength(3);
        expect(written[1]!.keys).toHaveLength(records);
        expect(written[2]!.keys.some((key) => key.toString('latin1').startsWith('player_server_'))).toBe(false);
        reportProgress(`An early commit of ${records} held player records: ${held} bytes`, 'Held write bytes');
        await level.disable();
    });

    it('is lost with nothing else when the process dies before the next pass', async () => {
        const { folder, level, overworld, server } = await harness('crash-held');
        await level.save();
        const before = blocksOf(overworld.getLoadedChunk(1, 0)!);

        await changeAndUnload(overworld, 1);
        await level.savePlayerData('leaver', leftAt('leaver', 3));
        const crashed = crashCopy(folder);
        await level.disable();

        expect(blocksOf(await savedChunk(crashed, server, Dimensions.Overworld, 1))).toEqual(before);
        const reader = new LevelDB(crashed, server);
        reader.setLevel({ name: 'reader', seed: 1234n });
        await reader.enable();
        try {
            expect(await reader.readPlayerData('leaver')).toBeNull();
        } finally {
            await reader.disable();
        }
    });
});
