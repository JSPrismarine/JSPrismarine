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
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import LevelDB from './providers/leveldb/LevelDB';
import { World } from './World';
import { inertEntityRuntime } from '../testing/entityServer';

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
 * the tick to start the save and move on, which is what these cover: it does not wait, two saves
 * never overlap, a shutdown still waits, and what reaches disk is unchanged.
 */

/** The floor every generated chunk gets, which is also what the round trip compares. */
const GROUND = -60;

/** Enough chunks for the save to take more than one batch of `SAVE_BATCH_SIZE`. */
const CHUNK_COUNT = 20;

/** Two minutes of ticks, which is `World.AUTO_SAVE_INTERVAL_TICKS`. */
const AUTO_SAVE_TICK = 20 * 120;

let scratch: string;
let previousDirectory: string | undefined;

const testServer = (): Server =>
    stub<Server>({
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
        // No data-driven runtime: this world runs the written entity classes.
        getEntityRuntime: () => inertEntityRuntime()
    });

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
 * A provider whose chunk writes can be held open.
 *
 * Parking the writes is what makes the question "did the tick wait for this?" answerable
 * without depending on how fast a real disk happens to be.
 */
class GatedLevelDB extends LevelDB {
    /** Resolves once the first write has been parked. */
    public readonly parked: Promise<void>;

    /** How many chunks have reached disk. */
    public written = 0;

    /** How many passes over the chunk list have started. */
    public passes = 0;

    /** How many were ever inside one at the same time, which is the overlap signal. */
    public concurrentPasses = 0;

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

    /** Lets the parked write, and every write after it, through. */
    public openGate(): void {
        this.open = true;
        this.release();
    }

    public override async writeChunk(chunk: Chunk): Promise<void> {
        if (!this.open) {
            this.announceParked();
            await this.gate;
        }

        this.written++;
        return super.writeChunk(chunk);
    }
}

/** A world over a real LevelDB in a scratch folder, with `CHUNK_COUNT` dirty chunks loaded. */
const loadedWorld = async (name: string) => {
    const server = testServer();
    const folder = path.join(scratch, 'worlds', name);
    const provider = new GatedLevelDB(folder, server);
    const world = new World({ name, path: folder, server, provider, seed: 1234, generator });

    // Counted here rather than in `writeChunk`, because a pass that writes nothing still has
    // to be distinguishable from no pass at all.
    const chunks = world.saveChunks.bind(world);
    let inside = 0;
    world.saveChunks = async () => {
        provider.passes++;
        inside++;
        provider.concurrentPasses = Math.max(provider.concurrentPasses, inside);
        try {
            return await chunks();
        } finally {
            inside--;
        }
    };

    // What `World.enable` does for the provider, without the start region: the provider reads
    // the world's dimension back out, so it has to know which world it belongs to.
    provider.setWorld(world);
    await provider.enable();

    for (let i = 0; i < CHUNK_COUNT; i++) await world.getChunk(i, 0);

    return { world, provider };
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
    it('lets the tick finish while chunks are still being written', async () => {
        const { world, provider } = await loadedWorld('unblocked');

        world.setTicks(AUTO_SAVE_TICK - 1);
        await world.update(AUTO_SAVE_TICK);

        // The tick is over and the save has not written a single chunk, because it is parked
        // on the first one. Awaited, this call could not have returned.
        await provider.parked;
        expect(provider.written).toBe(0);

        provider.openGate();
        await world.disable();
        expect(provider.written).toBe(CHUNK_COUNT);
    });

    it('does not start a second pass while the first is still running', async () => {
        const { world, provider } = await loadedWorld('no-overlap');

        world.setTicks(AUTO_SAVE_TICK - 1);
        await world.update(AUTO_SAVE_TICK);
        await provider.parked;

        // Two minutes of ticks later the next autosave falls due, with the first still parked.
        world.setTicks(AUTO_SAVE_TICK * 2 - 1);
        await world.update(AUTO_SAVE_TICK * 2);

        expect(provider.passes).toBe(1);

        provider.openGate();
        await world.disable();
    });

    it('queues an explicit save behind itself rather than writing beside it', async () => {
        const { world, provider } = await loadedWorld('explicit');

        world.setTicks(AUTO_SAVE_TICK - 1);
        await world.update(AUTO_SAVE_TICK);
        await provider.parked;

        // What a plugin or a console command does, with the autosave still parked. It has to
        // happen - a caller that asks for a save gets one - but not at the same time.
        const explicit = world.save();
        provider.openGate();
        await explicit;

        expect(provider.passes).toBe(2);
        expect(provider.concurrentPasses).toBe(1);

        await world.disable();
    });

    it('is waited for by a shutdown, so the provider never closes under a write', async () => {
        const { world, provider } = await loadedWorld('shutdown');

        world.setTicks(AUTO_SAVE_TICK - 1);
        await world.update(AUTO_SAVE_TICK);
        await provider.parked;

        let shutDown = false;
        const disabling = world.disable().then(() => void (shutDown = true));

        // A turn of the loop with the save still parked. The shutdown must still be waiting.
        await new Promise((resolve) => setImmediate(resolve));
        expect(shutDown).toBe(false);

        provider.openGate();
        await disabling;

        // Every chunk reached disk before the database closed, and nothing threw on the way.
        expect(shutDown).toBe(true);
        expect(provider.written).toBeGreaterThanOrEqual(CHUNK_COUNT);
    });
});

describe('what a backgrounded autosave writes', () => {
    it('round trips every block, biome and block entity', async () => {
        const { world, provider } = await loadedWorld('round-trip');

        // A block entity in the first chunk, so the comparison covers more than blocks.
        (await world.getChunk(0, 0)).setBlockEntity(signAt(3, GROUND + 1, 5));

        const before = await Promise.all(
            Array.from({ length: CHUNK_COUNT }, async (_unused, i) => snapshot(await world.getChunk(i, 0)))
        );

        world.setTicks(AUTO_SAVE_TICK - 1);
        await world.update(AUTO_SAVE_TICK);
        provider.openGate();
        await world.disable();

        // A second world over the same folder, reading back what the first wrote.
        const server = testServer();
        const folder = path.join(scratch, 'worlds', 'round-trip');
        const reader = new LevelDB(folder, server);
        reader.setWorld(world);
        await reader.enable();

        try {
            for (let i = 0; i < CHUNK_COUNT; i++) {
                const read = await reader.readChunk(i, 0, 1234, generator);
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
