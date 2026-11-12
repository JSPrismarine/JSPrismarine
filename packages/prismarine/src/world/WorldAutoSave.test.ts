import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { GenericBlockEntity } from '../blockentity/GenericBlockEntity';
import type { Config } from '../config/Config';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import type { Generator } from './Generator';
import LevelDB from './providers/leveldb/LevelDB';
import type { ProviderSavePass } from './providers/SavePass';
import type { ChunkSaveContext } from './providers/ChunkSaveContext';
import type { Level } from './Level';
import { inertEntityRuntime, liveTestEntities, testContent } from '../testing/entityServer';
import { DimensionTravel } from './portal/DimensionTravel';
import { Position } from './Position';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { testLevel } from '../testing/level';
import { ChunkCompletionQueue } from './ChunkCompletionQueue';

/**
 * The autosave, and the fact that a tick must not wait for it.
 *
 * `World.update` used to `await this.save()`. `Server.tick` installs the next tick's timer only
 * once `update` has resolved, so the whole server stopped for as long as the save took - about
 * a second and a half for the 441 freshly generated chunks a start region leaves behind. The
 * batching inside `saveChunks` did not help: its `setImmediate` yields freed the socket, but
 * nothing could schedule the next tick while the tick that started the save was still running.
 *
 * On an idle machine that is under the tick loop's two second catch-up limit and invisible. On a
 * loaded one it is over, and the server announces that it skipped ninety ticks. The fix is for
 * the tick to start the save and move on. Under ADR 0018 the tick takes the cut and encodes a
 * bounded share of it, and the commit runs outside the tick. These cover that: the tick does not
 * wait, two saves never overlap, a shutdown still waits, and what reaches disk is unchanged.
 */

/** The floor every generated chunk gets, which is also what the round trip compares. */
const GROUND = -60;

/** Enough chunks for the save to take more than one batch of `SAVE_BATCH_SIZE`. */
const CHUNK_COUNT = 20;

/** Two minutes of ticks, which is `AUTO_SAVE_INTERVAL_TICKS` in `LevelSave.ts`. */
const AUTO_SAVE_TICK = 20 * 120;

let scratch: string;
let previousDirectory: string | undefined;

const testServer = (): Server => {
    const server: Server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
                verbose: () => {}
            }),
        // Nothing preloads here: the chunks these tests save are loaded by hand, so the
        // interesting state is reached in milliseconds rather than in a start region.
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        // No data-driven runtime: this world runs the written entity classes.
        getChunkCompletionQueue: () => new ChunkCompletionQueue(),
        getEntityRuntime: () => inertEntityRuntime(),
        // Weather can draw randomness during a tick; keep persistence tests reproducible.
        getRandom: () => () => 0.5,
        // The tick asks every world for its portal contacts; nothing here stands in one.
        getDimensionTravel: () => new DimensionTravel(server)
    });
    return server;
};

/** A column of stone under a column of air, distinct per chunk so a mix-up would show. */
const generatedChunk = (cx: number, cz: number): Chunk => {
    const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const marker = BlockRuntimeIds.getByName(cx + cz === 0 ? 'minecraft:gold_block' : 'minecraft:dirt');

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, -64, GROUND, stone);
    }
    chunk.setBlockRuntimeId(0, GROUND + 1, 0, marker);

    return chunk;
};

const generator: Generator = {
    generateChunk: async (cx: number, cz: number) => generatedChunk(cx, cz)
};

/**
 * A sign's worth of NBT, so the round trip has a block entity to compare.
 *
 * The remainder carries only what the class does not model: `id` and the coordinates are
 * `BlockEntity.toNBT`'s to add, and putting them here as well would order the written tags
 * differently from the ones `fromNBT` reads back, for the same content.
 */
const signAt = (x: number, y: number, z: number): GenericBlockEntity => {
    const extra = new NBTTagCompound();
    extra.addValue('Text', new Types.StringVal(`written at ${x} ${y} ${z}`));

    return new GenericBlockEntity('Sign', new Vector3(x, y, z), extra);
};

/**
 * A provider whose save passes can be held at their commit.
 *
 * Parking the commit is what makes the question "did the tick wait for this?" answerable
 * without depending on how fast a real disk happens to be.
 */
class GatedLevelDB extends LevelDB {
    /** Resolves once the first commit has been parked. */
    public readonly parked: Promise<void>;

    /** How many chunks have reached disk through a committed pass. */
    public written = 0;

    /** How many passes have started. */
    public passes = 0;

    /** How many were ever between their cut and the end of their commit at once, which is the overlap signal. */
    public concurrentPasses = 0;

    /** The last pass started, whose encodes a test can count. */
    public lastPass: ProviderSavePass | undefined;

    private inside = 0;
    private open = false;
    private release: () => void = () => {};
    private announceParked: () => void = () => {};
    private readonly gate: Promise<void>;

    public constructor(folder: string, server: Server) {
        super(folder, server);
        this.gate = new Promise<void>((resolve) => {
            this.release = resolve;
        });
        this.parked = new Promise<void>((resolve) => {
            this.announceParked = resolve;
        });
    }

    /** Lets the parked commit, and every commit after it, through. */
    public openGate(): void {
        this.open = true;
        this.release();
    }

    /** The unload pass writes a chunk on its own, outside a save pass. */
    public override async writeChunk(chunk: Chunk, saveContext?: ChunkSaveContext): Promise<void> {
        await this.wait();
        await super.writeChunk(chunk, saveContext);
        this.written++;
    }

    private async wait(): Promise<void> {
        if (this.open) return;
        this.announceParked();
        await this.gate;
    }

    public override beginSavePass(): ProviderSavePass {
        const pass = super.beginSavePass();
        this.lastPass = pass;
        const commit = pass.commit.bind(pass);
        const cutChunk = pass.cutChunk.bind(pass);
        let chunks = 0;
        this.passes++;
        this.inside++;
        this.concurrentPasses = Math.max(this.concurrentPasses, this.inside);
        pass.cutChunk = (chunk, context) => {
            chunks++;
            cutChunk(chunk, context);
        };
        pass.commit = async (options) => {
            try {
                await this.wait();
                await commit(options);
                this.written += chunks;
            } finally {
                this.inside--;
            }
        };
        return pass;
    }
}

/**
 * A world over a real LevelDB in a scratch folder, with `CHUNK_COUNT` dirty chunks loaded.
 *
 * The level knows its spawn before the world opens, so enabling the world generates no start
 * region: the chunks these tests save are loaded by hand, and the interesting state is reached
 * in milliseconds.
 */
const loadedWorld = async (name: string) => {
    const server = testServer();
    const folder = path.join(scratch, 'worlds', name);
    const provider = new GatedLevelDB(folder, server);
    const level = testLevel({ name, path: folder, server, provider, generator, spawn: new Vector3(0, GROUND, 0) });
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);

    for (let i = 0; i < CHUNK_COUNT; i++) await world.getChunk(i, 0);

    return { world, provider, level };
};

/** Runs level ticks until the autosave in progress has encoded its last sub chunk and asked to commit. */
const tickUntilParked = async (level: Level, provider: GatedLevelDB, from: number): Promise<number> => {
    let parked = false;
    void provider.parked.then(() => {
        parked = true;
    });
    let tick = from;
    for (; !parked && tick < from + 200; tick++) {
        level.update(tick);
        await new Promise((resolve) => setImmediate(resolve));
    }
    return tick;
};

beforeEach(() => {
    previousDirectory = process.env.JSP_DIR;
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-autosave-'));
    process.env.JSP_DIR = scratch;
});

afterEach(() => {
    if (previousDirectory === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDirectory;

    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('the autosave a tick starts', () => {
    it('cuts in the tick, encodes over the ticks after it and commits outside them', async () => {
        const { world, provider, level } = await loadedWorld('unblocked');

        world.setTicks(AUTO_SAVE_TICK - 1);
        // The tick returns at once: the cut is in it, and the commit is not.
        expect(level.update(AUTO_SAVE_TICK)).toBeUndefined();
        expect(provider.passes).toBe(1);
        expect(provider.written).toBe(0);

        // The chunks' sections are encoded `SAVE_ENCODE_BUDGET` a tick, then the commit parks.
        await tickUntilParked(level, provider, AUTO_SAVE_TICK + 1);
        expect(provider.written).toBe(0);

        provider.openGate();
        await level.disable();
        expect(provider.written).toBe(CHUNK_COUNT);
    });

    it('does not start a second pass while the first is still running', async () => {
        const { world, provider, level } = await loadedWorld('no-overlap');

        world.setTicks(AUTO_SAVE_TICK - 1);
        level.update(AUTO_SAVE_TICK);
        await tickUntilParked(level, provider, AUTO_SAVE_TICK + 1);

        // Two minutes of ticks later the next autosave falls due, with the first still parked.
        world.setTicks(AUTO_SAVE_TICK * 2 - 1);
        level.update(AUTO_SAVE_TICK * 2);

        expect(provider.passes).toBe(1);

        provider.openGate();
        await level.disable();
    });

    it('queues an explicit save behind itself rather than writing beside it', async () => {
        const { world, provider, level } = await loadedWorld('explicit');

        world.setTicks(AUTO_SAVE_TICK - 1);
        level.update(AUTO_SAVE_TICK);
        await tickUntilParked(level, provider, AUTO_SAVE_TICK + 1);

        // What a plugin or a console command does, with the autosave still parked. It has to
        // happen - a caller that asks for a save gets one - but not at the same time.
        const explicit = world.save();
        provider.openGate();
        await explicit;

        expect(provider.passes).toBe(2);
        expect(provider.concurrentPasses).toBe(1);

        await level.disable();
    });

    it('finishes an autosave a shutdown finds still encoding, before the provider closes', async () => {
        const { world, provider, level } = await loadedWorld('shutdown');
        // Four more sections in every chunk, so the cut holds more sub chunks than one tick's
        // encode budget and the shutdown starts with some still to encode.
        const dirt = BlockRuntimeIds.getByName('minecraft:dirt');
        for (let x = 0; x < CHUNK_COUNT; x++) {
            const chunk = await world.getChunk(x, 0);
            for (const y of [0, 16, 32, 48]) chunk.setBlockRuntimeId(0, y, 0, dirt);
        }

        world.setTicks(AUTO_SAVE_TICK - 1);
        level.update(AUTO_SAVE_TICK);
        expect(provider.lastPass?.pendingEncodes).toBeGreaterThan(0);
        // No more ticks: a shutdown stops them, so the encoding the ticks would have done is the
        // shutdown's to finish.
        let shutDown = false;
        const disabling = level.disable().then(() => void (shutDown = true));
        await provider.parked;

        // A turn of the loop with the commit still parked. The shutdown must still be waiting.
        await new Promise((resolve) => setImmediate(resolve));
        expect(shutDown).toBe(false);

        provider.openGate();
        await disabling;

        // Every chunk reached disk before the database closed, and nothing threw on the way.
        expect(shutDown).toBe(true);
        expect(provider.written).toBeGreaterThanOrEqual(CHUNK_COUNT);
        expect(provider.lastPass?.pendingEncodes).toBe(0);
    });

    it('lets a tick finish while an unload write is pending, then round trips its entity', async () => {
        const { world, provider, level } = await loadedWorld('unload-tick');
        const chunk = await world.getChunk(11, 0);
        const dirt = BlockRuntimeIds.getByName('minecraft:dirt');
        chunk.setBlockRuntimeId(0, GROUND + 1, 0, dirt);

        const players = Reflect.get(world, 'players');
        if (!(players instanceof Map)) throw new Error('World player map is unavailable');
        players.set(
            1n,
            stub<PlayerSession>({
                getViewDistance: () => 10,
                isConnected: () => false,
                getViewPosition: () => new Position(0, 64, 0, world)
            })
        );

        // A real entity runtime over this world, which holds the cow the unload saves.
        const live = liveTestEntities(() => world).entityRuntime(Dimensions.Overworld.name);
        const server = Reflect.get(world, 'server');
        if (typeof server !== 'object' || server === null) throw new Error('World server is unavailable');
        Reflect.set(server, 'getEntityRuntime', () => live);

        const cow = live.runtime.spawn('minecraft:cow', { x: 11 * 16 + 0.5, y: GROUND + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');

        level.setTicks(1);
        // The tick returns at once; the unload it started writes outside it.
        expect(world.update(1)).toBeUndefined();
        await provider.parked;

        expect(world.getLoadedChunk(11, 0)).toBe(chunk);
        provider.openGate();
        const unloading = Reflect.get(world, 'unloading');
        if (!(unloading instanceof Promise)) throw new Error('World unload task is unavailable');
        await unloading;

        expect(world.getLoadedChunk(11, 0)).toBeNull();

        const restored = await provider.readChunk(Dimensions.Overworld, 11, 0, 1234n, generator);
        const [storedActor] = restored.takeStoredEntities();
        expect(storedActor?.getString('identifier', '')).toBe('minecraft:cow');
        expect([...(storedActor?.getList('Pos', false) ?? [])].map((value) => value.getValue())).toEqual([
            11 * 16 + 0.5,
            GROUND + 1,
            0.5
        ]);

        await level.disable();
    });
});

describe('what a backgrounded autosave writes', () => {
    it('round trips every block, biome and block entity', async () => {
        const { world, provider, level } = await loadedWorld('round-trip');

        // A block entity in the first chunk, so the comparison covers more than blocks.
        (await world.getChunk(0, 0)).setBlockEntity(signAt(3, GROUND + 1, 5));

        const before = await Promise.all(
            Array.from({ length: CHUNK_COUNT }, async (_unused, i) => snapshot(await world.getChunk(i, 0)))
        );

        world.setTicks(AUTO_SAVE_TICK - 1);
        await level.update(AUTO_SAVE_TICK);
        provider.openGate();
        await level.disable();

        // A second world over the same folder, reading back what the first wrote.
        const server = testServer();
        const folder = path.join(scratch, 'worlds', 'round-trip');
        const reader = new LevelDB(folder, server);
        reader.setWorld(world);
        await reader.enable();

        try {
            for (let i = 0; i < CHUNK_COUNT; i++) {
                const read = await reader.readChunk(Dimensions.Overworld, i, 0, 1234n, generator);
                expect(snapshot(read), `chunk ${i},0`).toEqual(before[i]);
            }
        } finally {
            await reader.disable();
        }
    });
});

/**
 * Everything about a chunk that has to survive a save: every block runtime id in it, its
 * biome ids, and every block entity's NBT.
 *
 * Both layers, because a water-logged block keeps its fluid in layer one and a save that
 * dropped it would otherwise compare equal.
 */
const snapshot = (chunk: Chunk) => {
    const blocks: number[] = [];
    for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                blocks.push(chunk.getBlockRuntimeId(x, y, z, 0), chunk.getBlockRuntimeId(x, y, z, 1));
            }
        }
    }

    return {
        blocks,
        // A section is either one id for the whole of it or one per block, so both shapes
        // have to be flattened before they can be compared.
        biomes: chunk
            .getBiomes()
            .toSectionIds()
            .map((ids) => (typeof ids === 'number' ? [ids] : Array.from(ids))),
        blockEntities: Array.from(chunk.getBlockEntities(), (entity) => nbtBytes(entity.toNBT()))
    };
};

/** A compound as the bytes the provider writes, so the comparison is byte for byte. */
const nbtBytes = (nbt: NBTTagCompound): string => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(nbt);

    return stream.getBuffer().toString('hex');
};
