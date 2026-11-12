/**
 * Where a trip lands, over a real level with an Overworld, a Nether and an End in one LevelDB
 * save. The worlds are empty chunks, so a trip into the Nether finds no footing and forces a
 * portal, which is the case that exercises the most of the creation path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Types } from '@jsprismarine/nbt';
import { Gametype } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import type { DimensionTypeDefinition, LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { Config } from '../../config/Config';
import type { ConsoleSender } from '../../command/ConsoleSender';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { builtInEntityDefinitions, fixtureContentOptions, fixtureDefinitions } from '../../content/testing';
import { serverWorldSource } from '../../content/world/serverSource';
import { EventEmitter } from '../../events/EventEmitter';
import { EntityRuntimes } from '../../entity/data/live';
import { ItemActor } from '../../entity/data/itemActor';
import { InertActor } from '../../entity/data/storeActors';
import EntitySerializer from '../../entity/EntitySerializer';
import { savedActorNbt } from '../../testing/savedActor.test.helper';
import type ClientConnection from '../../network/ClientConnection';
import Codec2193 from '../../network/codec/Codec2193';
import type PlayerSession from '../../network/PlayerSession';
import { connectedSession, sessionsWith } from '../../testing/playerSession.test.helper';
import type { PermissionManager } from '../../permission/PermissionManager';
import type Server from '../../Server';
import { TEST_GENERATOR_KIND } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import type { ChunkScheduler } from '../ChunkScheduler';
import Chunk from '../chunk/Chunk';
import { Dimensions, dimensionByName } from '../Dimension';
import type { DimensionType } from '../Dimension';
import type { Generator } from '../Generator';
import { GeneratorFactories } from '../GeneratorFactories';
import { Level } from '../Level';
import LevelDB from '../providers/leveldb/LevelDB';
import type { World } from '../World';
import type WorldManager from '../WorldManager';
import { DimensionTravel, END_ARRIVAL_YAW, stemTarget } from './DimensionTravel';
import { WorldMessages } from '../WorldMessages';
import type { PortalArrival, PortalBlockRef } from './DimensionTravel';
import { ChunkCompletionQueue } from '../ChunkCompletionQueue';
import type { SealedTick } from '../changelog/ChangeLog';
import { insideTick, runInTick } from '../TickContext';
import type { StoreActor } from '../../entity/data/storeActors';

const NETHER_STEM_ID = 'minecraft:the_nether';
const END_STEM_ID = 'minecraft:the_end';

/** The Overworld spawn, known before the save opens so enabling searches for nothing. */
const WORLD_SPAWN = new Vector3(0, 70, 0);

const stemOf = (type: string): LevelStem => ({ type, generator: { type: TEST_GENERATOR_KIND, settings: undefined } });

const STEMS: ReadonlyMap<string, LevelStem> = new Map([
    [OVERWORLD_STEM_ID, stemOf(Dimensions.Overworld.id)],
    [NETHER_STEM_ID, stemOf(Dimensions.Nether.id)],
    [END_STEM_ID, stemOf(Dimensions.TheEnd.id)]
]);

const DIMENSION_TYPES: ReadonlyMap<string, DimensionTypeDefinition> = new Map([
    [Dimensions.Overworld.id, Dimensions.Overworld.java],
    [Dimensions.Nether.id, Dimensions.Nether.java],
    [Dimensions.TheEnd.id, Dimensions.TheEnd.java]
]);

/** Empty chunks, and dry land at every column so a spawn search settles at once. */
const emptyGenerator = (dimension: DimensionType): Generator => ({
    generateChunk: async (cx, cz) => new Chunk(cx, cz, new Map(), dimension),
    surfaceAt: () => ({ y: 64, name: 'minecraft:stone' })
});

const runtimeId = (name: string, states: Record<string, string> = {}): number => {
    const id = BlockRuntimeIds.tryGetByState(name, states);
    if (id === null) throw new Error(`the palette has no ${name}`);
    return id;
};

/** Lights a 2 by 3 portal interior with `minCorner` at the bottom negative end of `axis`. */
const lightPortal = async (world: World, minCorner: Vector3, axis: 'x' | 'z'): Promise<void> => {
    const portal = runtimeId('minecraft:portal', { portal_axis: axis });
    for (let a = 0; a < 2; a += 1) {
        for (let dy = 0; dy < 3; dy += 1) {
            const x = axis === 'x' ? minCorner.getX() + a : minCorner.getX();
            const z = axis === 'z' ? minCorner.getZ() + a : minCorner.getZ();
            // A write never loads its chunk, so the setup loads it first.
            await world.getChunk(x >> 4, z >> 4);
            world.setBlockRuntimeId(x, minCorner.getY() + dy, z, portal);
        }
    }
};

let scratch: string;

/** The entity definitions a scene's data runtimes run. */
interface SceneOptions {
    /** Entity definitions for the data-driven runtime of every dimension; left out, the fixture's. */
    readonly entities?: ReturnType<typeof definitionsOf>['entities'];
}

/**
 * A level with three vanilla stems over a scratch LevelDB, and the server around it, with no
 * world built yet.
 */
const buildLevel = async ({ entities }: SceneOptions = {}) => {
    const folder = path.join(scratch, 'level');
    let level: Level | undefined;
    let content: ServerContent | undefined;
    // Always a data runtime per dimension, which holds the players a world's `addPlayer` enters.
    const runtimes = new EntityRuntimes();

    // One queue, inactive unless a test activates it: an inactive queue admits a chunk as soon as
    // it is ready, and an active one holds it for an input step, as the ticker's does.
    const completions = new ChunkCompletionQueue();
    // A real bus, so a test can listen for the travel events and cancel one.
    const events = new EventEmitter();
    const sessions = sessionsWith({ getPlayerList: () => new Map(), getAllPlayers: () => [] });
    const server: Server = stub<Server>({
        on: (id, listener) => {
            events.on(id, listener);
            return server;
        },
        post: (pair) => events.post(pair),
        emit: (id, event) => events.emit(id, event),
        removeListener: () => server,
        getDimensionTravel: () => travel,
        getTick: () => 0,
        getRandom: () => () => 0.5,
        getConsoleSender: () => stub<ConsoleSender>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [] }),
        getSessionManager: () => sessions,
        getChunkCompletionQueue: () => completions,
        getContent: () => {
            if (content === undefined) throw new Error('the content was read before it was built');
            return content;
        },
        // Opening the dimension's content adapter is what builds its runtime, as `Server` does.
        getStorePlayers: () => runtimes.players,
        getEntityRuntime: (dimension) => {
            if (content === undefined) throw new Error('the entity runtime was read before the content was built');
            content.world.blockWorld.at(dimension);
            const live = runtimes.at(dimension);
            if (live === undefined) throw new Error(`no entity runtime opened for ${dimension}`);
            return live;
        },
        getWorldManager: () =>
            stub<WorldManager>({
                getDefaultWorld: () => {
                    const overworld = level?.loadedWorld(OVERWORLD_STEM_ID);
                    if (overworld === undefined) throw new Error('no Overworld yet');
                    return overworld;
                }
            }),
        broadcastPacket: async () => {},
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getPreloadRadius: () => 0,
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4,
                getPacketCompressionLevel: () => 0,
                getPacketCompressionThreshold: () => 256,
                getDifficulty: () => 2
            })
    });

    level = new Level({
        name: 'level',
        path: folder,
        server,
        provider: new LevelDB(folder, server),
        seed: 1234n,
        stems: STEMS,
        dimensionTypes: DIMENSION_TYPES,
        factories: new GeneratorFactories([
            { kind: TEST_GENERATOR_KIND, build: (context) => emptyGenerator(context.dimension) }
        ]),
        worldgen: () => {
            throw new Error('this level never reads the Java registries');
        }
    });
    level.setSpawn(WORLD_SPAWN);
    await level.enable();

    // The content's world source resolves a dimension to this level's world of it, as the
    // server's resolves one to the default level's.
    const built = level;
    content = buildServerContent({
        ...fixtureContentOptions(
            entities === undefined
                ? {}
                : {
                      load: () => ({
                          definitions: definitionsOf({ ...fixtureDefinitions(), entities }),
                          diagnostics: []
                      })
                  }
        ),
        world: serverWorldSource({
            worldFor: (dimension) => built.loadedWorld(dimensionByName(dimension)?.id ?? dimension),
            content: () => {
                if (content === undefined) throw new Error('the content world was read before the content was built');
                return content;
            },
            seed: 1234n,
            difficulty: () => 2,
            entityRuntimes: runtimes
        })
    });

    const travel = new DimensionTravel(server);
    return { server, level, travel, completions };
};

/** {@link buildLevel} with the world of each of its three dimensions built. */
const buildScene = async (options: SceneOptions = {}) => {
    const scene = await buildLevel(options);
    const overworld = await scene.level.world(OVERWORLD_STEM_ID);
    const nether = await scene.level.world(NETHER_STEM_ID);
    const end = await scene.level.world(END_STEM_ID);
    return { ...scene, overworld, nether, end };
};

/** A survival player standing at a feet position, whose session records what it sends into `sent`. */
const playerAt = (server: Server, world: World, feet: Vector3, sent: unknown[] = []): PlayerSession => {
    const connection = stub<ClientConnection>({
        codec: Codec2193,
        getAddress: () => new InetAddress('127.0.0.1', 19132),
        sendDataPacket: async (packet) => void sent.push(packet),
        sendPacketsAsync: async (packets) => void sent.push(...packets),
        // Portal tests inspect travel state and sent packets, not the outbound batch queue.
        flushOutboundPackets: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });
    return connectedSession({
        server,
        connection,
        world,
        eyes: new Vector3(feet.getX(), feet.getY() + 1.62, feet.getZ()),
        name: 'Traveler'
    });
};

/** The portal block reference of a lit portal's lowest block at `minCorner`. */
const portalAt = (world: World, minCorner: Vector3): PortalBlockRef => ({
    world,
    position: minCorner,
    block: 'minecraft:portal'
});

/** A dropped stack in the world's store, whose actor is all `resolve` and `touch` read. */
const itemAt = (world: World, feet: Vector3): StoreActor => {
    const live = world.dataEntities();
    const item = live.runtime.droppedItems.spawn(
        { x: feet.getX(), y: feet.getY(), z: feet.getZ() },
        { stack: { name: 'minecraft:dirt', count: 1 } }
    );
    const actor = item === undefined ? undefined : live.actors.actorOf(item.id);
    if (actor === undefined) throw new Error('the store made no actor for the dropped stack');
    return actor;
};

/**
 * A mob in the world's store, for the tick-driven tests. Only its actor's update runs, which is
 * the portal clock; the store's own tick, and with it the mob's physics, never does.
 */
const mobAt = (world: World, feet: Vector3): StoreActor => {
    const live = world.dataEntities();
    const cow = live.runtime.spawn('minecraft:cow', { x: feet.getX(), y: feet.getY(), z: feet.getZ() });
    const actor = cow === undefined ? undefined : live.actors.actorOf(cow.id);
    if (actor === undefined) throw new Error('the fixture declares no minecraft:cow');
    return actor;
};

/** The cows a world's store holds, through their actors. A cow that changes world is a new actor there. */
const cowsIn = (world: World): StoreActor[] => world.getActors().filter((actor) => actor.getType() === 'minecraft:cow');

/**
 * The input steps that follow a trip's start: each waits for the destination's preparation and
 * then admits, until no trip is left. The scene's completion queue is inactive, so a chunk the
 * preparation loads enters its world as soon as it is ready.
 */
const settle = async (travel: DimensionTravel): Promise<void> => {
    for (let step = 0; step < 10 && travel.pending > 0; step += 1) {
        await travel.prepared();
        await travel.admit();
    }
    expect(travel.pending).toBe(0);
};

/**
 * Starts a trip and lands it as the input step does, answering where it landed with nothing
 * moved: the transfer is replaced while the trip lands, so a test reads the arrival alone.
 */
const resolveTrip = async (
    travel: DimensionTravel,
    entity: StoreActor,
    portal: PortalBlockRef
): Promise<PortalArrival | undefined> => {
    let landed: PortalArrival | undefined;
    const { transfer } = travel;
    travel.transfer = async (_traveler, arrival) => {
        landed = { ...arrival, createdPortal: 'createdPortal' in arrival && arrival.createdPortal === true };
    };
    try {
        if (travel.depart(entity, portal)) await settle(travel);
    } finally {
        travel.transfer = transfer;
    }
    return landed;
};

const nameAt = (world: World, x: number, y: number, z: number): string | undefined =>
    world.loadedBlockAt(x, y, z)?.name;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-travel-'));
});

afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('Where a trip lands', () => {
    describe('through a nether portal', () => {
        it('lands a player in the Nether at the scaled position and builds a portal there', async () => {
            const scene = await buildScene();
            await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
            expect(scene.overworld.getPortalIndex().size).toBe(6);

            const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
            await scene.overworld.addPlayer(player);
            const arrival = await resolveTrip(scene.travel, player.getActor()!, {
                world: scene.overworld,
                position: new Vector3(80, 64, 0),
                block: 'minecraft:portal'
            });

            expect(arrival?.world).toBe(scene.nether);
            expect(arrival?.createdPortal).toBe(true);
            // 80 / 8 is 10; the Nether is all air, so the portal is forced one block back along
            // the axis with its floor clamped up to Java's 70, and the player stands in its
            // first column.
            // To float precision: the offset in the frame is worked out over the player's 0.6 box.
            expect(arrival?.position.getX()).toBeCloseTo(9.5);
            expect([arrival?.position.getY(), arrival?.position.getZ()]).toEqual([70, 0.5]);
            expect(arrival?.yaw).toBe(player.yaw);

            expect(nameAt(scene.nether, 9, 70, 0)).toBe('minecraft:portal');
            expect(nameAt(scene.nether, 10, 72, 0)).toBe('minecraft:portal');
            expect(nameAt(scene.nether, 8, 69, 0)).toBe('minecraft:obsidian');
            expect(nameAt(scene.nether, 11, 73, 0)).toBe('minecraft:obsidian');
            // The forced platform's netherrack flank, two blocks across from the frame.
            expect(nameAt(scene.nether, 9, 69, 2)).toBe('minecraft:netherrack');
            // The write path fed the Nether's index with the six new blocks.
            expect(scene.nether.getPortalIndex().size).toBe(6);

            await scene.level.disable();
        }, 60_000);

        it('does not build a portal for an item, which stays where it is', async () => {
            const scene = await buildScene();
            await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');

            const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
            const arrival = await resolveTrip(scene.travel, item, {
                world: scene.overworld,
                position: new Vector3(80, 64, 0),
                block: 'minecraft:portal'
            });

            expect(arrival).toBeUndefined();
            expect(scene.nether.getPortalIndex().size).toBe(0);

            await scene.level.disable();
        }, 60_000);

        it('arrives in a portal that already stands within 128 blocks, keeping its place and turning with the axis', async () => {
            const scene = await buildScene();
            await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
            await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');

            const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
            const arrival = await resolveTrip(scene.travel, item, {
                world: scene.overworld,
                position: new Vector3(80, 64, 0),
                block: 'minecraft:portal'
            });

            expect(arrival?.world).toBe(scene.nether);
            expect(arrival?.createdPortal).toBe(false);
            // Centered in the source portal's width, so centered in the destination's, which
            // runs along z: the along offset becomes z and the across offset x.
            expect(arrival?.position.getX()).toBeCloseTo(12.5);
            expect(arrival?.position.getY()).toBe(70);
            expect(arrival?.position.getZ()).toBeCloseTo(0.5);
            expect(arrival?.yaw).toBe(item.yaw + 90);
            expect(scene.nether.getPortalIndex().size).toBe(6);

            await scene.level.disable();
        }, 60_000);

        it('sends a traveler through a nether portal in the End to the Overworld, as the links say', async () => {
            const scene = await buildScene();
            await lightPortal(scene.end, new Vector3(0, 60, 0), 'x');
            await lightPortal(scene.overworld, new Vector3(2, 60, 0), 'x');

            const item = itemAt(scene.end, new Vector3(0.5, 60, 0.5));
            const arrival = await resolveTrip(scene.travel, item, {
                world: scene.end,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:portal'
            });

            expect(arrival?.world).toBe(scene.overworld);
            expect(arrival?.createdPortal).toBe(false);
            expect(arrival?.position.getY()).toBe(60);

            await scene.level.disable();
        }, 60_000);

        it('answers nothing for a block that is no portal', async () => {
            const scene = await buildScene();
            const item = itemAt(scene.overworld, new Vector3(0.5, 64, 0.5));

            expect(
                await resolveTrip(scene.travel, item, {
                    world: scene.overworld,
                    position: new Vector3(0, 64, 0),
                    block: 'minecraft:obsidian'
                })
            ).toBeUndefined();

            await scene.level.disable();
        }, 60_000);
    });

    describe('through an end portal', () => {
        it('writes the End platform and lands a player at (100.5, 49, 0.5) facing west', async () => {
            const scene = await buildScene();
            const player = playerAt(scene.server, scene.overworld, new Vector3(0.5, 60, 0.5));
            await scene.overworld.addPlayer(player);

            const arrival = await resolveTrip(scene.travel, player.getActor()!, {
                world: scene.overworld,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:end_portal'
            });

            expect(arrival?.world).toBe(scene.end);
            expect(arrival?.position).toEqual(new Vector3(100.5, 49, 0.5));
            // `Direction.WEST.toYRot()`, and pitch 0.
            expect(arrival?.yaw).toBe(END_ARRIVAL_YAW);
            expect(arrival?.pitch).toBe(0);
            expect(arrival?.createdPortal).toBe(false);

            // `EndPlatformFeature`: 5 by 5 obsidian one block under the arrival block, air above.
            expect(nameAt(scene.end, 100, 48, 0)).toBe('minecraft:obsidian');
            expect(nameAt(scene.end, 98, 48, -2)).toBe('minecraft:obsidian');
            expect(nameAt(scene.end, 102, 48, 2)).toBe('minecraft:obsidian');
            expect(nameAt(scene.end, 103, 48, 0)).toBe('minecraft:air');
            expect(nameAt(scene.end, 100, 49, 0)).toBe('minecraft:air');

            await scene.level.disable();
        }, 60_000);

        it('lands anything else one block higher, at y 50', async () => {
            const scene = await buildScene();
            const item = itemAt(scene.overworld, new Vector3(0.5, 60, 0.5));

            const arrival = await resolveTrip(scene.travel, item, {
                world: scene.overworld,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:end_portal'
            });

            expect(arrival?.world).toBe(scene.end);
            expect(arrival?.position).toEqual(new Vector3(100.5, 50, 0.5));
            expect(arrival?.yaw).toBe(END_ARRIVAL_YAW);

            await scene.level.disable();
        }, 60_000);

        it('lands a player leaving the End at their respawn point, which is the Overworld spawn without a bed', async () => {
            const scene = await buildScene();
            const player = playerAt(scene.server, scene.end, new Vector3(0.5, 60, 0.5));
            // A player stepping into the End's portal is in the End, which finds its session.
            await scene.end.addPlayer(player);

            const arrival = await resolveTrip(scene.travel, player.getActor()!, {
                world: scene.end,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:end_portal'
            });

            expect(arrival?.world).toBe(scene.overworld);
            expect(arrival?.position).toEqual(WORLD_SPAWN);
            expect(arrival?.createdPortal).toBe(false);

            await scene.level.disable();
        }, 60_000);

        it('lands anything else leaving the End above the Overworld spawn', async () => {
            const scene = await buildScene();
            const item = itemAt(scene.end, new Vector3(0.5, 60, 0.5));

            const arrival = await resolveTrip(scene.travel, item, {
                world: scene.end,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:end_portal'
            });

            expect(arrival?.world).toBe(scene.overworld);
            expect(arrival?.position).toEqual(new Vector3(0.5, 71, 0.5));

            await scene.level.disable();
        }, 60_000);
    });
});

describe('DimensionTravel.touch', () => {
    it('opens a contact that remembers the portal block, and keeps it on later touches', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        const portal = portalAt(scene.overworld, new Vector3(80, 64, 0));

        await scene.travel.touch(item, portal);
        const contact = item.portalContact();
        await scene.travel.touch(item, portal);

        expect(contact?.getPortal()).toBe(portal);
        expect(item.portalContact()).toBe(contact);

        await scene.level.disable();
    }, 60_000);

    it('raises `entityPortalEnter` once per entry, and a canceled one opens no contact', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        const portal = portalAt(scene.overworld, new Vector3(80, 64, 0));
        const entered: PortalBlockRef[] = [];
        let refuse = true;
        scene.server.on('entityPortalEnter', (event) => {
            entered.push(event.getPortal());
            if (refuse) event.preventDefault();
        });

        await scene.travel.touch(item, portal);
        expect(item.portalContact()).toBeUndefined();

        refuse = false;
        await scene.travel.touch(item, portal);
        await scene.travel.touch(item, portal);
        expect(item.portalContact()).toBeDefined();
        expect(entered).toEqual([portal, portal]);

        await scene.level.disable();
    }, 60_000);

    it('waits for an asynchronous listener, so one that cancels after an await still stops the contact', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        scene.server.on('entityPortalEnter', async (event) => {
            // A plugin that asks a database before it decides.
            await new Promise<void>((resolve) => setImmediate(resolve));
            event.preventDefault();
        });

        await scene.travel.touch(item, portalAt(scene.overworld, new Vector3(80, 64, 0)));

        expect(item.portalContact()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('ignores a player whose client is still on the loading screen of the last change', async () => {
        const scene = await buildScene();
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(player);
        await scene.travel.transfer(player.getActor()!, {
            world: scene.nether,
            position: new Vector3(12.5, 70, 0.5),
            yaw: 0,
            pitch: 0
        });
        // Past the 10 tick cooldown, with the screen never closed.
        player.getPlayer().setPortalCooldown(0);

        await scene.travel.touch(player.getActor()!, portalAt(scene.nether, new Vector3(12, 70, 0)));

        expect(player.getActor()!.portalContact()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('opens no contact for an entity on portal cooldown, and winds the cooldown back to its full length', async () => {
        const scene = await buildScene();
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        item.setPortalCooldown(5);
        const entered: StoreActor[] = [];
        scene.server.on('entityPortalEnter', (event) => void entered.push(event.getEntity()));

        await scene.travel.touch(item, portalAt(scene.overworld, new Vector3(80, 64, 0)));

        expect(item.portalContact()).toBeUndefined();
        expect(entered).toEqual([]);
        // Java's `Entity.setAsInsidePortal`: a touch while on cooldown starts it over, so it
        // only runs out once the entity has left the portal.
        expect(item.getPortalCooldown()).toBe(300);

        await scene.level.disable();
    }, 60_000);
});

describe('DimensionTravel.transfer', () => {
    it('moves a dropped stack out of one store into the other at the arrival, on a 300 tick cooldown', async () => {
        const scene = await buildScene({ entities: new Map(builtInEntityDefinitions()) });
        const from = scene.overworld.dataEntities();
        const to = scene.nether.dataEntities();
        const stack = from.dropItem(
            { x: 80.5, y: 64, z: 0.5 },
            { stack: { name: 'minecraft:stone', count: 3 }, age: 40, pickupDelay: 7 }
        );
        const body = stack === undefined ? undefined : from.actors.actorOf(stack.id);
        if (stack === undefined || body === undefined) throw new Error('the scene declares no dropped item');

        await scene.travel.transfer(body, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(stack.removed).toBeDefined();
        expect(from.runtime.byId(stack.id)).toBeUndefined();
        expect(scene.overworld.getActors()).not.toContain(body);
        const [arrived] = to.runtime
            .entities()
            .toArray()
            .filter((entity) => entity.identifier === 'minecraft:item');
        const arrivedBody = arrived === undefined ? undefined : to.actors.actorOf(arrived.id);
        if (!(arrivedBody instanceof ItemActor)) throw new Error('the stack did not arrive as an item actor');
        expect(arrived?.position).toEqual({ x: 10.5, y: 70, z: 0.5 });
        expect(arrivedBody?.savedItem()).toMatchObject({
            stack: { name: 'minecraft:stone', count: 3 },
            age: 40,
            pickupDelay: 7
        });
        expect(arrivedBody?.getPortalCooldown()).toBe(300);
        expect(scene.nether.getActors()).toContain(arrivedBody);

        await scene.level.disable();
    }, 60_000);

    it('moves an actor no pack declares into the other store under its saved identifier', async () => {
        const scene = await buildScene({ entities: new Map(builtInEntityDefinitions()) });
        const from = scene.overworld.dataEntities();
        const to = scene.nether.dataEntities();
        const saved = savedActorNbt('minecraft:llama', { x: 80.5, y: 64, z: 0.5 });
        saved.addValue('UniqueID', new Types.LongVal(7n));
        const entity = from.restoreInert(EntitySerializer.fromNBT(saved));
        const actor = entity === undefined ? undefined : from.actors.actorOf(entity.id);
        if (entity === undefined || actor === undefined) throw new Error('the scene declares no inert actor');

        await scene.travel.transfer(actor, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(from.runtime.byId(entity.id)).toBeUndefined();
        const [arrived] = [...to.actors.all()].filter((candidate) => candidate.getType() === 'minecraft:llama');
        if (!(arrived instanceof InertActor)) throw new Error('the llama did not arrive as an inert actor');
        expect(arrived.entity.position).toEqual({ x: 10.5, y: 70, z: 0.5 });
        expect(arrived.yaw).toBe(90);
        expect(arrived.persistentNbt?.getLong('UniqueID', 0n)).toBe(7n);
        expect(arrived.getPortalCooldown()).toBe(300);

        await scene.level.disable();
    }, 60_000);

    it('sends a player through the session, with the 10 tick cooldown and the screen pending', async () => {
        const scene = await buildScene();
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(player);
        const seen: [World, World][] = [];
        scene.server.on('playerChangeDimension', (event) => void seen.push([event.getFrom(), event.getTo()]));

        await scene.travel.transfer(player.getActor()!, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(seen).toEqual([[scene.overworld, scene.nether]]);
        expect(player.getWorld()).toBe(scene.nether);
        // The arrival is feet, like a mob's; a player stores their eyes, so the two differ.
        expect(player.getFeetY()).toBeCloseTo(70);
        expect(player.getPlayer().getPortalCooldown()).toBe(10);
        expect(player.pendingDimensionChange()?.arrival.world).toBe(scene.nether);
        expect(scene.overworld.getViewers()).not.toContain(player);
        expect(scene.nether.getViewers()).toContain(player);

        await scene.level.disable();
    }, 60_000);

    it('leaves a player where they are when `playerChangeDimension` is canceled', async () => {
        const scene = await buildScene();
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(player);
        scene.server.on('playerChangeDimension', (event) => event.preventDefault());

        await scene.travel.transfer(player.getActor()!, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.getPlayer().getPortalCooldown()).toBe(0);
        expect(player.pendingDimensionChange()).toBeUndefined();
        expect(scene.overworld.getViewers()).toContain(player);

        await scene.level.disable();
    }, 60_000);
});

describe('DimensionTravel.transfer out of the End', () => {
    /** The End-exit arrival of `player`, resolved from an exit portal block under them. */
    const exitArrival = async (scene: Awaited<ReturnType<typeof buildScene>>, player: PlayerSession) => {
        const arrival = await resolveTrip(scene.travel, player.getActor()!, {
            world: scene.end,
            position: new Vector3(0, 60, 0),
            block: 'minecraft:end_portal'
        });
        if (arrival === undefined) throw new Error('the End exit resolved to nowhere');
        return arrival;
    };

    it('holds a first exit on the credits: one ShowCredits Start, the flag set, and no change yet', async () => {
        const scene = await buildScene();
        const sent: unknown[] = [];
        const player = playerAt(scene.server, scene.end, new Vector3(0.5, 60, 0.5), sent);
        await scene.end.addPlayer(player);
        const arrival = await exitArrival(scene, player);
        sent.length = 0;

        await scene.travel.transfer(player.getActor()!, arrival);

        const credits = sent.filter((packet): packet is ShowCreditsPacket => packet instanceof ShowCreditsPacket);
        expect(credits).toHaveLength(1);
        expect(credits[0]!.creditsState).toBe(CreditsState.Start);
        expect(credits[0]!.playerRuntimeId).toBe(player.getRuntimeId());
        expect(sent.some((packet) => packet instanceof ChangeDimensionPacket)).toBe(false);
        expect(player.getPlayer().hasSeenCredits()).toBe(true);
        expect(player.getWorld()).toBe(scene.end);
        expect(player.pendingCreditsArrival()).toBe(arrival);
        expect(player.pendingDimensionChange()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('moves the player to their respawn point as a respawn once the credits finish', async () => {
        const scene = await buildScene();
        const sent: unknown[] = [];
        const player = playerAt(scene.server, scene.end, new Vector3(0.5, 60, 0.5), sent);
        await scene.end.addPlayer(player);
        await scene.travel.transfer(player.getActor()!, await exitArrival(scene, player));
        sent.length = 0;

        expect(player.completeCredits()).toBe(true);
        expect(await scene.travel.admit()).toBe(1);

        const change = sent.find((packet): packet is ChangeDimensionPacket => packet instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.respawn).toBe(true);
        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.getFeetY()).toBeCloseTo(WORLD_SPAWN.getY());
        expect(player.pendingCreditsArrival()).toBeUndefined();
        // Settled by the respawn exchange, not by a loading screen the client closes.
        expect(player.pendingDimensionChange()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('skips the credits for a player who has seen them, changing world at once', async () => {
        const scene = await buildScene();
        const sent: unknown[] = [];
        const player = playerAt(scene.server, scene.end, new Vector3(0.5, 60, 0.5), sent);
        await scene.end.addPlayer(player);
        player.getPlayer().setSeenCredits(true);
        const arrival = await exitArrival(scene, player);
        sent.length = 0;

        await scene.travel.transfer(player.getActor()!, arrival);

        expect(sent.some((packet) => packet instanceof ShowCreditsPacket)).toBe(false);
        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.pendingCreditsArrival()).toBeUndefined();
        expect(player.pendingDimensionChange()?.arrival.world).toBe(scene.overworld);

        await scene.level.disable();
    }, 60_000);
});

/** A mob no written class answers to, with a component group only an event adds. */
const TRAVELER = 'jsprismarine:traveler';

const TRAVELER_ENTITIES = new Map([
    [
        TRAVELER,
        definitionOf('entities', TRAVELER, {
            format_version: '1.21.0',
            'minecraft:entity': {
                description: { identifier: TRAVELER, is_spawnable: true, is_summonable: true },
                components: {
                    'minecraft:health': { value: 10, max: 10 },
                    'minecraft:collision_box': { width: 0.6, height: 1.8 },
                    'minecraft:physics': {},
                    'minecraft:type_family': { family: ['traveler', 'mob'] }
                },
                component_groups: { marked: { 'minecraft:mark_variant': { value: 7 } } },
                events: { 'jsprismarine:mark': { add: { component_groups: ['marked'] } } }
            }
        })
    ]
]);

describe('DimensionTravel.transfer of a data-driven mob', () => {
    it('moves the mob once, with its runtime record and cooldown, into the destination runtime', async () => {
        const scene = await buildScene({ entities: TRAVELER_ENTITIES });
        const overworldLive = scene.server.getEntityRuntime(Dimensions.Overworld.name);
        const netherLive = scene.server.getEntityRuntime(Dimensions.Nether.name);
        const spawned = overworldLive.runtime.spawn(TRAVELER, { x: 80.5, y: 64, z: 0.5 });
        if (spawned === undefined) throw new Error('the fixture declares the traveler');
        // State the record carries and a fresh spawn would not have. `fire` queues the event
        // for the next runtime tick, which never comes here, so it is applied by hand.
        spawned.instance.fire('jsprismarine:mark');
        spawned.instance.applyQueuedEvents();
        expect(spawned.instance.activeComponentGroups()).toContain('marked');
        const actor = overworldLive.actors.actorOf(spawned.id);
        if (actor === undefined) throw new Error('the runtime gave the traveler no actor');
        const travelersIn = (world: World) => world.getActors().filter((each) => each.getType() === TRAVELER);
        expect(travelersIn(scene.overworld)).toEqual([actor]);

        await scene.travel.transfer(actor, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(travelersIn(scene.overworld)).toEqual([]);
        expect(overworldLive.runtime.entities().toArray()).toEqual([]);
        const arrived = travelersIn(scene.nether);
        expect(arrived).toHaveLength(1);
        const restored = netherLive.runtime.byId(Number(arrived[0]!.getRuntimeId()));
        expect(restored?.persistentIdentity).toBe(spawned.persistentIdentity);
        expect(restored?.instance.activeComponentGroups()).toContain('marked');
        expect(arrived[0]!.getPosition().getX()).toBe(10.5);
        expect(arrived[0]!.getPosition().getY()).toBe(70);
        expect(arrived[0]!.yaw).toBe(90);
        expect(arrived[0]!.getPortalCooldown()).toBe(300);

        await scene.level.disable();
    }, 60_000);
});

/**
 * One world tick for an entity standing in a portal: the world's touch and the entity's own
 * update, then the input steps that land a trip the update started.
 */
const tickInPortal = async (travel: DimensionTravel, entity: StoreActor, portal: PortalBlockRef, tick: number) => {
    await travel.touch(entity, portal);
    await entity.update(tick);
    // The input steps of the ticks after it, which land a trip the update started.
    await settle(travel);
};

describe('DimensionTravel through the tick', () => {
    it('sends anything but a player through on its first tick in a lit portal, arriving in the Nether on cooldown', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const mob = mobAt(scene.overworld, new Vector3(80.5, 64, 0.5));

        await tickInPortal(scene.travel, mob, portalAt(scene.overworld, new Vector3(80, 64, 0)), 1);

        expect(cowsIn(scene.overworld)).toEqual([]);
        const [arrived] = cowsIn(scene.nether);
        if (arrived === undefined) throw new Error('the cow did not arrive in the Nether');
        expect(arrived.getPosition().getY()).toBe(70);
        expect(arrived.getPortalCooldown()).toBe(300);
        expect(arrived.portalContact()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('holds a survival player for 80 ticks, then sends them through the session', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(player);
        const portal = portalAt(scene.overworld, new Vector3(80, 64, 0));

        for (let tick = 1; tick <= 79; tick += 1) await tickInPortal(scene.travel, player.getActor()!, portal, tick);
        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.getActor()!.portalContact()?.getPortalTime()).toBe(79);

        await tickInPortal(scene.travel, player.getActor()!, portal, 80);

        expect(player.getWorld()).toBe(scene.nether);
        expect(player.getPlayer().getPortalCooldown()).toBe(10);
        expect(player.pendingDimensionChange()?.arrival.world).toBe(scene.nether);
        // Bedrock creates the portal for a player: the trip built one to arrive in.
        expect(scene.nether.getPortalIndex().size).toBe(6);

        await scene.level.disable();
    }, 60_000);

    it('leaves an entity where it is when its `entityPortalEnter` is canceled, tick after tick', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const mob = mobAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        scene.server.on('entityPortalEnter', (event) => event.preventDefault());

        for (let tick = 1; tick <= 3; tick += 1)
            await tickInPortal(scene.travel, mob, portalAt(scene.overworld, new Vector3(80, 64, 0)), tick);

        expect(cowsIn(scene.overworld)).toEqual([mob]);
        expect(mob.getPortalCooldown()).toBe(0);
        expect(cowsIn(scene.nether)).toEqual([]);

        await scene.level.disable();
    }, 60_000);

    it('keeps a mob that stays in the arrival portal there, however many ticks pass', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        await tickInPortal(
            scene.travel,
            mobAt(scene.overworld, new Vector3(80.5, 64, 0.5)),
            portalAt(scene.overworld, new Vector3(80, 64, 0)),
            1
        );
        const [mob] = cowsIn(scene.nether);
        if (mob === undefined) throw new Error('the cow did not arrive in the Nether');

        // It arrived inside the Nether portal, so the world dispatches a touch every tick.
        // Well past the 300 tick cooldown: each touch winds the cooldown back to its full
        // length, as Java's `Entity.setAsInsidePortal` does, so the mob never bounces back.
        const arrivalPortal = portalAt(scene.nether, new Vector3(12, 70, 0));
        for (let tick = 2; tick <= 420; tick += 1) await tickInPortal(scene.travel, mob, arrivalPortal, tick);

        expect(cowsIn(scene.nether)).toEqual([mob]);
        expect(mob.portalContact()).toBeUndefined();
        expect(mob.isOnPortalCooldown()).toBe(true);

        await scene.level.disable();
    }, 60_000);

    it('travels again once the mob has left the portal for the whole cooldown and stepped back in', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        let tick = 0;
        await tickInPortal(
            scene.travel,
            mobAt(scene.overworld, new Vector3(80.5, 64, 0.5)),
            portalAt(scene.overworld, new Vector3(80, 64, 0)),
            ++tick
        );
        const [mob] = cowsIn(scene.nether);
        if (mob === undefined) throw new Error('the cow did not arrive in the Nether');
        const arrivalPortal = portalAt(scene.nether, new Vector3(12, 70, 0));
        for (let stand = 0; stand < 50; stand += 1) await tickInPortal(scene.travel, mob, arrivalPortal, ++tick);

        for (let out = 0; out < 100; out += 1) await mob.update(++tick);
        expect(mob.isOnPortalCooldown()).toBe(true);

        // Stepping back in before the cooldown has run out winds it back to the full 300,
        // minus the one tick the same update counts down.
        await tickInPortal(scene.travel, mob, arrivalPortal, ++tick);
        expect(cowsIn(scene.nether)).toEqual([mob]);
        expect(mob.getPortalCooldown()).toBe(299);

        // Out of the portal, the cooldown finally runs down, and the next contact travels.
        for (let out = 0; out < 300; out += 1) await mob.update(++tick);
        expect(mob.isOnPortalCooldown()).toBe(false);
        await tickInPortal(scene.travel, mob, arrivalPortal, ++tick);

        expect(cowsIn(scene.nether)).toEqual([]);
        expect(cowsIn(scene.overworld)).toHaveLength(1);

        await scene.level.disable();
    }, 60_000);

    it('keeps a creative player in the Nether while they stand in the arrival portal', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        bot.getPlayer().gamemode = Gametype.CREATIVE;
        await scene.overworld.addPlayer(bot);

        // Creative goes through on the first contact tick, into the portal the trip builds, and
        // lands at the next input step.
        await scene.overworld.update(1);
        await settle(scene.travel);
        expect(bot.getWorld()).toBe(scene.nether);
        const pending = bot.pendingDimensionChange();
        expect(pending).toBeDefined();
        // The client closes its loading screen with the bot still standing in the portal.
        expect(await bot.completeDimensionChange(pending!.loadingScreenId)).toBe(true);
        expect(bot.getFeetY()).toBeCloseTo(70);

        const changes: unknown[] = [];
        scene.server.on('playerChangeDimension', (event) => void changes.push(event));
        // Well past the 10 tick cooldown: standing in the portal winds it back every tick.
        for (let tick = 2; tick <= 420; tick += 1) await scene.nether.update(tick);

        expect(changes).toEqual([]);
        expect(bot.getWorld()).toBe(scene.nether);
        expect(bot.getActor()!.portalContact()).toBeUndefined();
        expect(bot.getActor()!.isOnPortalCooldown()).toBe(true);

        await scene.level.disable();
    }, 60_000);

    it('takes a bot standing in a hand-built portal to the Nether world through `World.update` and the input step', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(bot);

        for (let tick = 1; tick <= 80; tick += 1) await scene.overworld.update(tick);
        await settle(scene.travel);

        expect(bot.getWorld()).toBe(scene.nether);
        expect(scene.overworld.getViewers()).not.toContain(bot);
        expect(scene.nether.getViewers()).toContain(bot);

        await scene.level.disable();
    }, 60_000);

    it('does not start a second trip for a bot that sits on the loading screen inside the arrival portal', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addPlayer(bot);
        for (let tick = 1; tick <= 80; tick += 1) await scene.overworld.update(tick);
        await settle(scene.travel);
        const pending = bot.pendingDimensionChange();
        expect(pending?.arrival.world).toBe(scene.nether);
        expect(scene.nether.getPortalIndex().has({ x: 9, y: 70, z: 0 })).toBe(true);
        const entered: StoreActor[] = [];
        scene.server.on('entityPortalEnter', (event) => void entered.push(event.getEntity()));

        // The bot stands in the portal the trip built, the client has still not closed the
        // screen, and the Nether keeps ticking it.
        expect(bot.getFeetY()).toBeCloseTo(70);
        for (let tick = 81; tick <= 180; tick += 1) await scene.nether.update(tick);

        // The world never dispatched a touch for the bot, so no contact and no event, and the
        // cooldown is held while the screen is open, as `ServerPlayer.processPortalCooldown`
        // holds it while `isChangingDimension`.
        expect(entered).toEqual([]);
        expect(bot.getWorld()).toBe(scene.nether);
        expect(bot.getPlayer().getPortalCooldown()).toBe(10);
        expect(bot.getActor()!.portalContact()).toBeUndefined();
        expect(bot.pendingDimensionChange()).toBe(pending);
        expect(scene.nether.getViewers()).toContain(bot);

        await scene.level.disable();
    }, 60_000);
});

describe('DimensionTravel as messages', () => {
    /** The membership entries of a sealed tick, as what changed and for which entity. */
    const memberships = (sealed: SealedTick | undefined): [string, bigint][] =>
        (sealed?.entries ?? []).flatMap((entry): [string, bigint][] =>
            entry.kind === 'membership' ? [[entry.change, entry.entity]] : []
        );

    /** Closes the tick the scene's setup wrote into, so the next tick holds only what it did. */
    const closeSetup = (...worlds: World[]): void => {
        for (const world of worlds) {
            world.beginChangeTick();
            world.sealChangeTick();
        }
    };

    it('leaves in one entry of the source world and enters in one of the destination, both at the next input step', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const mob = mobAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        closeSetup(scene.overworld, scene.nether);

        // The source world's tick: the touch, then the update that starts the trip.
        scene.overworld.beginChangeTick();
        scene.nether.beginChangeTick();
        await scene.travel.touch(mob, portalAt(scene.overworld, new Vector3(80, 64, 0)));
        await mob.update(1);
        const started = scene.overworld.sealChangeTick();
        const untouched = scene.nether.sealChangeTick();

        expect(scene.travel.pending).toBe(1);
        expect(memberships(started)).toEqual([]);
        expect(untouched?.entries).toEqual([]);
        expect(cowsIn(scene.overworld)).toEqual([mob]);
        expect(cowsIn(scene.nether)).toEqual([]);

        // The next input step, with both worlds' ticks open as the ticker opens them.
        await scene.travel.prepared();
        scene.overworld.beginChangeTick();
        scene.nether.beginChangeTick();
        expect(await scene.travel.admit()).toBe(1);
        const left = scene.overworld.sealChangeTick();
        const entered = scene.nether.sealChangeTick();

        const [arrived] = cowsIn(scene.nether);
        if (arrived === undefined) throw new Error('the cow did not arrive in the Nether');
        expect(memberships(left)).toEqual([['leave', mob.getRuntimeId()]]);
        expect(memberships(entered)).toEqual([['enter', arrived.getRuntimeId()]]);
        expect(scene.travel.pending).toBe(0);

        await scene.level.disable();
    }, 60_000);

    it('moves a player out of a world tick into the input step: one leave, one enter, the destination untouched before', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        bot.getPlayer().gamemode = Gametype.CREATIVE;
        scene.overworld.addPlayer(bot);
        closeSetup(scene.overworld, scene.nether);
        // From here a chunk waits for an input step, as under the ticker.
        scene.completions.activate();

        // Creative goes through on its first contact tick.
        scene.nether.beginChangeTick();
        await scene.overworld.update(1);
        const untouched = scene.nether.sealChangeTick();

        expect(scene.travel.pending).toBe(1);
        expect(memberships(scene.overworld.lastChangeTick())).toEqual([]);
        expect(untouched?.entries).toEqual([]);
        expect(bot.getWorld()).toBe(scene.overworld);

        // Input steps until the trip lands: the chunks the preparation loaded, then the trip.
        // Each step's entries are kept, so the counts cover every step it took.
        const left: [string, bigint][] = [];
        const entered: [string, bigint][] = [];
        let tick = 2;
        for (; scene.travel.pending > 0 && tick < 200; tick += 1) {
            scene.overworld.beginChangeTick();
            scene.nether.beginChangeTick();
            await scene.completions.admissions.admit(tick);
            await scene.travel.admit();
            left.push(...memberships(scene.overworld.sealChangeTick()));
            entered.push(...memberships(scene.nether.sealChangeTick()));
            // Lets the generation the step did not wait for finish before the next step.
            await new Promise((resolve) => setImmediate(resolve));
        }

        expect(scene.travel.pending).toBe(0);
        expect(bot.getWorld()).toBe(scene.nether);
        expect(left).toEqual([['leave', bot.runtimeId]]);
        expect(entered).toEqual([['enter', bot.runtimeId]]);

        scene.completions.deactivate();
        await scene.level.disable();
    }, 60_000);

    it('builds a destination nobody entered outside the tick that starts the trip, and lands the trip once it is ready', async () => {
        const scene = await buildLevel();
        const overworld = await scene.level.world(OVERWORLD_STEM_ID);
        const mob = mobAt(overworld, new Vector3(0.5, 60, 0.5));

        // Whether each build the trip asks for runs inside a tick.
        const builds: boolean[] = [];
        const build = scene.level.world.bind(scene.level);
        scene.level.world = async (dimensionId) => {
            builds.push(insideTick());
            return build(dimensionId);
        };

        await runInTick(async () => {
            await scene.travel.touch(mob, {
                world: overworld,
                position: new Vector3(0, 60, 0),
                block: 'minecraft:end_portal'
            });
            await mob.update(1);
        });

        // The tick filed the trip and asked for the End once, outside itself, and the cow is still here.
        expect(builds).toEqual([false]);
        expect(scene.travel.pending).toBe(1);
        expect(cowsIn(overworld)).toEqual([mob]);

        await settle(scene.travel);
        const end = scene.level.readyWorld(END_STEM_ID);
        if (end === undefined) throw new Error('the End was not built');
        expect(cowsIn(overworld)).toEqual([]);
        expect(cowsIn(end).map((cow) => cow.getPosition())).toEqual([new Vector3(100.5, 50, 0.5)]);

        await scene.level.disable();
    }, 60_000);

    it('files a move into a dimension nobody entered without waiting, builds it outside the tick, and lands it as one leave and one enter', async () => {
        const scene = await buildLevel();
        const overworld = await scene.level.world(OVERWORLD_STEM_ID);
        const bot = playerAt(scene.server, overworld, new Vector3(0.5, 64, 0.5));
        overworld.addPlayer(bot);
        closeSetup(overworld);

        // Whether each build the move asks for runs inside a tick.
        const builds: boolean[] = [];
        const build = scene.level.world.bind(scene.level);
        scene.level.world = async (dimensionId) => {
            builds.push(insideTick());
            return build(dimensionId);
        };

        // What a cross-dimension `/tp` files, inside the tick of the input that ran it.
        overworld.beginChangeTick();
        await runInTick(async () => {
            scene.travel.moveTo(
                bot,
                stemTarget(scene.level, NETHER_STEM_ID, { position: new Vector3(10, 70, 10), yaw: 0, pitch: 0 })
            );
        });
        const filed = overworld.sealChangeTick();

        expect(builds).toEqual([false]);
        expect(scene.travel.pending).toBe(1);
        expect(memberships(filed)).toEqual([]);
        expect(bot.getWorld()).toBe(overworld);

        // The input steps until the Nether is built and the move lands.
        await scene.travel.prepared();
        const nether = scene.level.readyWorld(NETHER_STEM_ID);
        if (nether === undefined) throw new Error('the Nether was not built');
        overworld.beginChangeTick();
        nether.beginChangeTick();
        expect(await scene.travel.admit()).toBe(1);
        const left = overworld.sealChangeTick();
        const entered = nether.sealChangeTick();

        expect(bot.getWorld()).toBe(nether);
        expect(bot.getFeetY()).toBeCloseTo(70);
        expect(memberships(left)).toEqual([['leave', bot.runtimeId]]);
        expect(memberships(entered)).toEqual([['enter', bot.runtimeId]]);

        await scene.level.disable();
    }, 60_000);

    it("holds a player's later move behind an earlier one that is not ready, so they land in order", async () => {
        const scene = await buildLevel();
        const overworld = await scene.level.world(OVERWORLD_STEM_ID);
        const end = await scene.level.world(END_STEM_ID);
        const bot = playerAt(scene.server, overworld, new Vector3(0.5, 64, 0.5));
        overworld.addPlayer(bot);
        const seen: string[] = [];
        const { changeWorld } = bot;
        bot.changeWorld = async (arrival, options) => {
            seen.push(arrival.world.getDimension().id);
            await changeWorld.call(bot, arrival, options);
        };

        scene.travel.moveTo(
            bot,
            stemTarget(scene.level, NETHER_STEM_ID, { position: new Vector3(0, 70, 0), yaw: 0, pitch: 0 })
        );
        scene.travel.move(bot, { world: end, position: new Vector3(0, 70, 0), yaw: 0, pitch: 0 });

        // The Nether is not built at this step, so the End waits behind it.
        expect(await scene.travel.admit()).toBe(0);
        expect(seen).toEqual([]);

        await settle(scene.travel);
        expect(seen).toEqual([Dimensions.Nether.id, Dimensions.TheEnd.id]);

        await scene.level.disable();
    }, 60_000);

    it('applies a message for another world in that world at the input step, and in no other', async () => {
        const scene = await buildScene();
        const bot = playerAt(scene.server, scene.nether, new Vector3(0.5, 70, 0.5));
        scene.nether.addPlayer(bot);
        closeSetup(scene.overworld, scene.nether);
        const messages = new WorldMessages((error) => {
            throw error;
        });

        // An input in the Overworld changes a player in the Nether, as `SetDefaultGameType` does.
        scene.overworld.beginChangeTick();
        scene.nether.beginChangeTick();
        // The write `PlayerSession.setGamemode` makes before its sends.
        messages.send(scene.nether, async () => bot.inputs().setPlayerGamemode(bot.getPlayer(), Gametype.CREATIVE));
        const filedHere = scene.overworld.sealChangeTick();
        const untouched = scene.nether.sealChangeTick();

        expect(filedHere?.entries).toEqual([]);
        expect(untouched?.entries).toEqual([]);
        expect(bot.getPlayer().gamemode).not.toBe(Gametype.CREATIVE);

        scene.overworld.beginChangeTick();
        scene.nether.beginChangeTick();
        expect(await messages.admit()).toBe(1);
        const elsewhere = scene.overworld.sealChangeTick();
        const applied = scene.nether.sealChangeTick();

        expect(bot.getPlayer().gamemode).toBe(Gametype.CREATIVE);
        expect(elsewhere?.entries).toEqual([]);
        expect(applied?.entries.length).toBeGreaterThan(0);

        await scene.level.disable();
    }, 60_000);
});
