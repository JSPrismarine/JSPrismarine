/**
 * Profiles World.update's chunk tick work with 4,225 loaded chunks and one player.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:world-update-chunks`.
 */
import os from 'node:os';

import type Server from '../src/Server';
import type ClientConnection from '../src/network/ClientConnection';
import type PlayerSession from '../src/network/PlayerSession';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { MobSpawner } from '../src/blockentity/BlockEntities';
import { BlockEntityRegistry } from '../src/blockentity/BlockEntityRegistry';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { StoreActors } from '../src/entity/data/storeActors';
import { entityFixture } from '../src/entity/data/testing';
import { testContent } from '../src/testing/entityServer';
import { stub } from '../src/testing/stub.test.helper';
import Chunk from '../src/world/chunk/Chunk';
import { Position } from '../src/world/Position';
import { World } from '../src/world/World';
import { NULL_WORLD_CHANGE_SINK } from '../src/world/WorldChangeSink';
import { tickFurnace } from '../src/world/cooking';

const CHUNK_RADIUS = 32;
const CHUNKS_PER_AXIS = CHUNK_RADIUS * 2 + 1;
const WARMUP_TICKS = 25;
const TICKS_PER_SAMPLE = 100;
const SAMPLES = 5;
const content = testContent();
const chestRuntimeId = BlockRuntimeIds.getByName('minecraft:chest');
const wheatRuntimeId = BlockRuntimeIds.getByName('minecraft:wheat');

const chestAt = (x: number, z: number) => {
    const root = new NBTTagCompound('');
    root.addValue('id', new Types.StringVal('Chest'));
    root.addValue('x', new Types.NumberVal(x * 16 + 1));
    root.addValue('y', new Types.NumberVal(64));
    root.addValue('z', new Types.NumberVal(z * 16 + 1));
    return BlockEntityRegistry.fromNBT(root);
};

/** What the world files in its player map: each player's session. */
type WorldPlayer = PlayerSession;

interface Output {
    digest: number;
}

const addToDigest = (output: Output, value: number): void => {
    output.digest = Math.imul(output.digest ^ value, 16777619) >>> 0;
};

const makeWorld = (legacyChunkScan: boolean, output: Output): World => {
    const chunks = new Map<number, Chunk>();
    for (let x = -CHUNK_RADIUS; x <= CHUNK_RADIUS; x++) {
        for (let z = -CHUNK_RADIUS; z <= CHUNK_RADIUS; z++) {
            const chunk = new Chunk(x, z);
            if (Math.abs(x) <= 10 && Math.abs(z) <= 10) {
                chunk.setBlockRuntimeId(1, 64, 1, chestRuntimeId);
                chunk.setBlockRuntimeId(2, 64, 2, wheatRuntimeId);
                chunk.setBlockEntity(chestAt(x, z));
            }
            chunks.set(Chunk.packXZ(x, z), chunk);
        }
    }

    let world: World;
    const { runtime } = entityFixture();
    const systems = {
        isLightingSettled: true,
        prepareLighting: () => {},
        tick: () => {
            for (const chunk of world.randomTickChunks()) {
                addToDigest(output, chunk.x);
                addToDigest(output, chunk.z);
                for (const section of chunk.sections) addToDigest(output, section);
            }
        }
    };

    // `World` normally fills these private fields in its constructor. This benchmark assembles
    // just the update dependencies it measures around the real prototype, outside timed samples.
    const target = Object.assign(Object.create(World.prototype) as World, {
        name: 'world-update-chunk-work-benchmark',
        closing: false,
        level: { getTicks: () => 1 },
        server: stub<Server>({ getContent: () => content }),
        players: new Map<number, WorldPlayer>(),
        chunks,
        loading: new Map(),
        systems,
        changes: { ...NULL_WORLD_CHANGE_SINK, flushBlockChanges: async () => {}, flushBlockEntities: async () => {} },
        getEntities: () => [],
        runBlockUpdates: async () => {},
        touchPortals: async () => {},
        getDragonFight: () => undefined,
        getRaidManager: () => undefined,
        dataEntities: () => ({
            // A real store, empty, whose tick the update opens and seals around the chunk work.
            runtime,
            tick: async () => {},
            persist: () => {},
            unload: () => false,
            actors: stub<StoreActors>({ all: () => [][Symbol.iterator]() })
        }),
        // The header the store seals each tick with, which reads level state this fixture has not.
        tickHeader: () => undefined,
        flushEntityAttributes: async () => {},
        updateTracking: async () => {},
        flushMovement: async () => {},
        sendTime: async () => {},
        beginDistantChunkUnloads: () => {}
    });
    world = target;
    world['players'].set(
        1,
        stub<WorldPlayer>({
            isConnected: () => true,
            getViewPosition: () => new Position(0, 64, 0, world),
            getViewDistance: () => CHUNK_RADIUS,
            getConnection: () => stub<ClientConnection>({ flushOutboundPackets: async () => {} })
        })
    );

    if (legacyChunkScan) {
        // Recreates the former per-pass map walk and simulation check for an apples-to-apples update profile.
        world['simulationChunks'] = (references) => {
            const simulated: Chunk[] = [];
            for (const chunk of world['chunks'].values()) {
                if (references.simulates(chunk.getX(), chunk.getZ())) simulated.push(chunk);
            }
            return simulated;
        };
        world['tickCookingStations'] = (references) => {
            for (const chunk of world['chunks'].values()) {
                if (!references.simulates(chunk.getX(), chunk.getZ())) continue;
                for (const blockEntity of [...chunk.getBlockEntities()]) {
                    const position = blockEntity.getPosition();
                    const state = chunk.getBlock(position.getX(), position.getY(), position.getZ());
                    tickFurnace(content, blockEntity, state.name);
                }
            }
        };
        world['tickSpawners'] = (references) => {
            for (const chunk of world['chunks'].values()) {
                if (!references.simulates(chunk.getX(), chunk.getZ())) continue;
                for (const blockEntity of [...chunk.getBlockEntities()]) {
                    if (blockEntity instanceof MobSpawner) throw new Error('Fixture unexpectedly contains a spawner');
                }
            }
        };
    }

    return world;
};

const sample = async (world: World, output: Output): Promise<number> => {
    output.digest = 2166136261;
    const started = performance.now();
    for (let tick = 1; tick <= TICKS_PER_SAMPLE; tick++) await world.update(tick);
    return performance.now() - started;
};

const measure = async (legacyChunkScan: boolean) => {
    const output = { digest: 2166136261 };
    const world = makeWorld(legacyChunkScan, output);
    for (let tick = 1; tick <= WARMUP_TICKS; tick++) await world.update(tick);

    const samples: number[] = [];
    let digest = 0;
    for (let index = 0; index < SAMPLES; index++) {
        samples.push(await sample(world, output));
        if (index === 0) digest = output.digest;
        else if (digest !== output.digest) throw new Error('World.update output changed between samples');
    }

    samples.sort((left, right) => left - right);
    return { p50MillisecondsPerTick: samples[Math.floor(samples.length / 2)]! / TICKS_PER_SAMPLE, digest };
};

const legacy = await measure(true);
const indexed = await measure(false);
if (legacy.digest !== indexed.digest) throw new Error('Indexed world update changed chunk or section order');

console.log(
    JSON.stringify(
        {
            fixture: {
                chunks: CHUNKS_PER_AXIS * CHUNKS_PER_AXIS,
                players: 1,
                simulatedChunks: 441,
                tickableBlockEntitiesPerSimulatedChunk: 0,
                unrelatedBlockEntitiesPerSimulatedChunk: 1
            },
            outputDigest: indexed.digest.toString(16).padStart(8, '0'),
            host: `${os.cpus()[0]?.model ?? 'unknown'}; Node ${process.versions.node}`,
            legacy,
            indexed,
            speedup: Number((legacy.p50MillisecondsPerTick / indexed.p50MillisecondsPerTick).toFixed(2))
        },
        null,
        2
    )
);
