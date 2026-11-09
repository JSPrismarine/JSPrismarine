import type { Logger } from '@jsprismarine/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';
import type Server from '../Server';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import { World } from './World';

const createWorld = () => {
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });
    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });
    const provider = stub<BaseProvider>({
        readChunk: async (_dimension, x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
    });

    return new World({
        name: 'world-replay-state-test',
        path: 'world-replay-state-test',
        server,
        level: fakeLevel({ server, provider }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });
};

describe('World.replayStateDigest', () => {
    afterEach(() => vi.restoreAllMocks());

    it('includes pending block update due ticks and processing order', () => {
        const first = createWorld();
        const same = createWorld();
        const reversed = createWorld();

        first.getBlockUpdates().schedule(1, 2, 3, 0, 2);
        first.getBlockUpdates().schedule(4, 5, 6, 0, 5);
        same.getBlockUpdates().schedule(1, 2, 3, 0, 2);
        same.getBlockUpdates().schedule(4, 5, 6, 0, 5);
        reversed.getBlockUpdates().schedule(4, 5, 6, 0, 5);
        reversed.getBlockUpdates().schedule(1, 2, 3, 0, 2);

        expect(first.replayStateDigest()).toBe(same.replayStateDigest());
        expect(first.replayStateDigest()).not.toBe(reversed.replayStateDigest());
    });

    it('distinguishes pending block and fluid tick queues', () => {
        const blockTick = createWorld();
        const fluidTick = createWorld();
        const scheduler = blockTick.getSystems().ticks;

        scheduler.list('block').schedule({ x: 1, y: 2, z: 3 }, 'minecraft:water', 4);
        fluidTick.getSystems().ticks.list('fluid').schedule({ x: 1, y: 2, z: 3 }, 'minecraft:water', 4);

        expect(blockTick.replayStateDigest()).not.toBe(fluidTick.replayStateDigest());
    });

    it('includes Java random tick generator state', () => {
        const initial = createWorld();
        const advanced = createWorld();
        vi.spyOn(advanced.getSystems(), 'getRandomTickState').mockReturnValue(1013904223);

        expect(initial.replayStateDigest()).not.toBe(advanced.replayStateDigest());
    });

    it('includes changes in pending light queue depth', async () => {
        const world = createWorld();
        await world.loadChunk(0, 0);
        const systems = world.getSystems();
        systems.lighting.onChunkLoaded(0, 0);
        world.setLoadedBlockState(8, 64, 8, { name: 'minecraft:glowstone', states: {} }, false);

        const pendingDigest = world.replayStateDigest();
        expect(systems.lighting.pending.queued).toBeGreaterThan(0);

        while (systems.lighting.pending.queued > 0) systems.lighting.flush(Number.MAX_SAFE_INTEGER);

        expect(world.replayStateDigest()).not.toBe(pendingDigest);
    });
});
