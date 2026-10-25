import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import { readLevelDat } from './providers/leveldb/LevelDat';
import LevelDB from './providers/leveldb/LevelDB';
import { World } from './World';

/**
 * Shutting a world down while its start region is still being generated.
 *
 * The dev file watcher restarts the server on every source change, which sends SIGTERM long
 * before the 441 chunk preload has finished. `World.disable` then ran while chunk requests
 * were still in flight, closed the LevelDB database underneath them, and the next request
 * threw "The world provider is not enabled" out of `World.enable` - a rejection nothing on
 * the startup path handles, so the process died reporting a port clash it never had.
 *
 * The signal that does not depend on how the two sides interleave is the count below: once a
 * shutdown has begun, the world must not ask the provider for another chunk.
 */

/** The one layer of stone every generated chunk here has, which the spawn search stands on. */
const GROUND = -63;

/** The configured default, so the remaining preload outlasts the shutdown it is racing. */
const PRELOAD_RADIUS = 10;

/** Long enough for the unfixed race to play out, which takes seconds of real LevelDB reads. */
const TIMEOUT_MS = 60_000;

/** The world folder, which `withCwd` resolves everything the world writes against. */
const WORLD_NAME = 'interrupted';

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
        getConfig: () => stub<Config>({ getPreloadRadius: () => PRELOAD_RADIUS })
    });

/**
 * A floor of stone at the origin and empty air everywhere else.
 *
 * The spawn search only ever looks at the origin column here, and the rest of the start
 * region is about the shutdown's ordering rather than its contents - so the other chunks are
 * left empty, which is several seconds of LevelDB writes this test does not need.
 */
const generatedChunk = (cx: number, cz: number): Chunk => {
    const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    if (cx !== 0 || cz !== 0) return chunk;

    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, -64, GROUND, stone);
    }

    return chunk;
};

interface GatedGenerator extends Generator {
    /** Resolves once a chunk request has been parked at the gate. */
    readonly parked: Promise<void>;
    /** Lets every parked and later request through. */
    open(): void;
    /** How many chunks have been handed out so far. */
    readonly generated: number;
}

/**
 * A generator that parks every request after the first.
 *
 * It is what lets a shutdown start with the preload demonstrably mid-batch, rather than at
 * whatever point a timer happened to land.
 */
const gatedGenerator = (): GatedGenerator => {
    let generated = 0;
    let open = (): void => {};
    let park = (): void => {};

    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    const parked = new Promise<void>((resolve) => {
        park = resolve;
    });

    return {
        get generated() {
            return generated;
        },
        parked,
        open: () => open(),
        generateChunk: async (cx: number, cz: number) => {
            if (generated > 0) {
                park();
                await gate;
            }

            generated++;
            return generatedChunk(cx, cz);
        }
    };
};

/** A provider that counts the chunk reads that arrive after a shutdown has begun. */
class CountingLevelDB extends LevelDB {
    /** Flipped by the test at the moment it starts the shutdown. */
    public shuttingDown = false;
    /** Chunk reads the world asked for once {@link shuttingDown} was set. */
    public lateReads = 0;

    public override async readChunk(
        cx: number,
        cz: number,
        seed: number,
        generator: Generator,
        config?: Parameters<LevelDB['readChunk']>[4]
    ): Promise<Chunk> {
        if (this.shuttingDown) this.lateReads++;

        return super.readChunk(cx, cz, seed, generator, config);
    }
}

const buildWorld = (name: string, generator: Generator) => {
    const server = testServer();
    const folder = path.join(scratch, 'worlds', name);
    const provider = new CountingLevelDB(folder, server);
    const world = new World({ name, path: folder, server, provider, seed: 1234, generator });

    return { world, provider };
};

const spawnInLevelDat = (name: string): { x: number; y: number; z: number } => {
    const level = readLevelDat(path.join(scratch, 'worlds', name));
    if (level === null) throw new Error('level.dat was never written');

    return {
        x: level.root.getNumber('SpawnX', Number.NaN),
        y: level.root.getNumber('SpawnY', Number.NaN),
        z: level.root.getNumber('SpawnZ', Number.NaN)
    };
};

/**
 * Starts a world, parks it mid-preload, shuts it down, and lets generation resume.
 *
 * Run once for the whole file. Generating and saving a batch of chunks through a real LevelDB
 * takes seconds, and every assertion below reads the same aftermath.
 */
const shutDownMidGeneration = async () => {
    const generator = gatedGenerator();
    const { world, provider } = buildWorld(WORLD_NAME, generator);

    const enabling = world.enable();
    await generator.parked;

    // The restart arrives here, with a batch of the start region still being generated.
    provider.shuttingDown = true;
    const disabling = world.disable();
    generator.open();

    // Settled rather than awaited, so a rejection is something to assert on rather than
    // something that takes the whole file down before any assertion runs.
    const settled = await Promise.allSettled([enabling, disabling]);
    return { world, provider, generator, settled };
};

describe('shutting a world down while it generates', () => {
    let scenario: Awaited<ReturnType<typeof shutDownMidGeneration>>;

    beforeAll(async () => {
        previousDirectory = process.env.JSP_DIR;
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-shutdown-'));
        process.env.JSP_DIR = scratch;

        scenario = await shutDownMidGeneration();
    }, TIMEOUT_MS);

    afterAll(() => {
        if (previousDirectory === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDirectory;

        fs.rmSync(scratch, { recursive: true, force: true });
    });

    it('lets both halves finish instead of throwing', () => {
        const failures = scenario.settled.flatMap((result) =>
            result.status === 'rejected' ? [String(result.reason)] : []
        );

        expect(failures).toEqual([]);
    });

    it('stops asking the provider for chunks', () => {
        expect(scenario.provider.lateReads).toBe(0);
    });

    it('persists the spawn point it found before the shutdown', () => {
        // The floor is flat, so the search settles on the origin column.
        expect(scenario.world.getKnownSpawnPosition()).toEqual(new Vector3(0, GROUND, 0));
        expect(spawnInLevelDat(WORLD_NAME)).toEqual({ x: 0, y: GROUND, z: 0 });
    });

    it('generates nothing more once the shutdown has finished', async () => {
        const atShutdown = scenario.generator.generated;
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(scenario.generator.generated).toBe(atShutdown);
    });
});
