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
import { Position } from './Position';
import { GenericEntity } from '../entity/GenericEntity';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { DataEntityRecord } from '../entity/data/persistence';
import { DATA_ENTITY_TAG } from '../entity/data/persistence';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

/**
 * A runtime that answers the record a save would write for each body, the way the real one does,
 * and whose `persist` would write it onto the bodies if anything called it.
 */
const recordingRuntime = (bodies: () => readonly GenericEntity[], health: () => number): LiveEntityRuntime => {
    const recordOf = (body: GenericEntity): DataEntityRecord => ({
        identifier: body.getType(),
        persistentIdentity: `body-${body.getRuntimeId()}`,
        componentGroups: [],
        properties: {},
        attributes: { health: health() },
        yaw: 0,
        pitch: 0,
        inventory: [],
        sitting: false,
        sleeping: false,
        loveTicks: 0,
        breedCooldown: 0
    });
    return stub<LiveEntityRuntime>({
        savedRecords: () => new Map(bodies().map((body) => [body, recordOf(body)])),
        persist: () => {
            for (const body of bodies()) {
                body.persistentNbt ??= new NBTTagCompound('');
                body.persistentNbt.addValue(DATA_ENTITY_TAG, new Types.StringVal(JSON.stringify(recordOf(body))));
            }
        }
    });
};

const createWorld = (entityRuntime: LiveEntityRuntime = inertEntityRuntime()) => {
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
        getEntityRuntime: () => entityRuntime
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

    it('hashes the record a save would write, and writes nothing onto an entity', () => {
        let health = 20;
        const bodies: GenericEntity[] = [];
        const world = createWorld(
            recordingRuntime(
                () => bodies,
                () => health
            )
        );
        const fresh = new GenericEntity({ identifier: 'minecraft:cow', position: new Position(1, 64, 1, world) });
        const saved = new GenericEntity({ identifier: 'minecraft:pig', position: new Position(2, 64, 2, world) });
        const savedNbt = new NBTTagCompound('');
        const savedRecord = new Types.StringVal(JSON.stringify({ health: 7 }));
        savedNbt.addValue(DATA_ENTITY_TAG, savedRecord);
        saved.persistentNbt = savedNbt;
        bodies.push(fresh, saved);
        vi.spyOn(world, 'getActors').mockImplementation(() => [...bodies]);

        const before = world.replayStateDigest();
        health = 12;
        const after = world.replayStateDigest();

        // A body with no compound is what `isLegacyEntity` reads as legacy; a digest must not change that.
        expect(fresh.persistentNbt).toBeNull();
        expect(saved.persistentNbt).toBe(savedNbt);
        expect(savedNbt.children.get(DATA_ENTITY_TAG)).toBe(savedRecord);
        expect(savedNbt.getString(DATA_ENTITY_TAG, '')).toBe('{"health":7}');
        expect(after).not.toBe(before);
        // The same bytes a save holds: persisting first and hashing the bodies gives the same digest.
        const digest = world.replayStateDigest();
        world.dataEntities().persist();
        const persisted = world.replayStateDigest();
        expect(persisted).toBe(digest);
    });
});
