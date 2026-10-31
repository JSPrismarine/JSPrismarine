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
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type { DimensionTypeDefinition, LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { Config } from '../../config/Config';
import type { ConsoleSender } from '../../command/ConsoleSender';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { fixtureContentOptions, fixtureDefinitions } from '../../content/testing';
import { serverWorldSource } from '../../content/world/serverSource';
import { EventEmitter } from '../../events/EventEmitter';
import { EntityRuntimes } from '../../entity/data/live';
import { Entity } from '../../entity/Entity';
import { eyePositionAt } from '../../entity/Human';
import { Item } from '../../entity/other/Item';
import type ClientConnection from '../../network/ClientConnection';
import { createConnectedPlayer } from '../../network/createConnectedPlayer';
import type { PermissionManager } from '../../permission/PermissionManager';
import Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import { inertEntityRuntime } from '../../testing/entityServer';
import { TEST_GENERATOR_KIND } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import type { ChunkScheduler } from '../ChunkScheduler';
import Chunk from '../chunk/Chunk';
import { Dimensions, dimensionByName } from '../Dimension';
import type { DimensionType } from '../Dimension';
import type { Generator } from '../Generator';
import { GeneratorFactories } from '../GeneratorFactories';
import { Level } from '../Level';
import { Position } from '../Position';
import LevelDB from '../providers/leveldb/LevelDB';
import type { World } from '../World';
import type WorldManager from '../WorldManager';
import { DimensionTravel, END_ARRIVAL_YAW } from './DimensionTravel';
import type { PortalBlockRef } from './DimensionTravel';

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
            await world.setBlockRuntimeId(x, minCorner.getY() + dy, z, portal);
        }
    }
};

let scratch: string;

/** What a scene runs its mobs through: the written classes, or a data runtime per dimension. */
interface SceneOptions {
    /** Entity definitions for a data-driven runtime in every dimension; left out, there is none. */
    readonly entities?: ReturnType<typeof definitionsOf>['entities'];
}

/** A level with its three vanilla dimensions over a scratch LevelDB, and the server around it. */
const buildScene = async ({ entities }: SceneOptions = {}) => {
    const folder = path.join(scratch, 'level');
    let level: Level | undefined;
    let content: ServerContent | undefined;
    const runtimes = entities === undefined ? undefined : new EntityRuntimes();

    // A real bus, so a test can listen for the travel events and cancel one.
    const events = new EventEmitter();
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
        getSessionManager: () => stub<SessionManager>({ getPlayerList: () => new Map(), getAllPlayers: () => [] }),
        getContent: () => {
            if (content === undefined) throw new Error('the content was read before it was built');
            return content;
        },
        // Opening the dimension's content adapter is what builds its runtime, as `Server` does.
        getEntityRuntime: (dimension) => {
            if (runtimes === undefined) return inertEntityRuntime();
            if (content === undefined) throw new Error('the entity runtime was read before the content was built');
            content.world.blockWorld.at(dimension);
            const live = runtimes.at(dimension);
            if (live === undefined) throw new Error(`no entity runtime opened for ${dimension}`);
            return live;
        },
        getWorldManager: () =>
            stub<WorldManager>({
                getWorlds: () => [...(level?.worlds() ?? [])],
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
            ...(runtimes === undefined ? {} : { entityRuntimes: runtimes })
        })
    });

    const travel = new DimensionTravel(server);
    const overworld = await level.world(OVERWORLD_STEM_ID);
    const nether = await level.world(NETHER_STEM_ID);
    const end = await level.world(END_STEM_ID);
    return { server, level, overworld, nether, end, travel };
};

/** A survival player standing at a feet position, wired to a session that sends nowhere. */
const playerAt = (server: Server, world: World, feet: Vector3): Player => {
    const player = new Player({
        position: new Position(feet.getX(), feet.getY() + 1.62, feet.getZ(), world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid: UUID.fromRandom(),
            name: 'Traveler',
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });
    const connection = stub<ClientConnection>({
        getRakNetSession: () => stub<RakNetSession>({ getAddress: () => new InetAddress('127.0.0.1', 19132) }),
        sendDataPacket: async () => {},
        sendPacketsAsync: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });
    createConnectedPlayer({ server, connection, player });
    // `update` does nothing for a player who never finished joining.
    player['connected'] = true;
    return player;
};

/** The portal block reference of a lit portal's lowest block at `minCorner`. */
const portalAt = (world: World, minCorner: Vector3): PortalBlockRef => ({
    world,
    position: minCorner,
    block: 'minecraft:portal'
});

const itemAt = (world: World, feet: Vector3): Item =>
    new Item({ position: new Position(feet.getX(), feet.getY(), feet.getZ(), world) });

/**
 * A written entity that is no player, for the tick-driven tests: its own update has no
 * physics, where an `Item`'s reads blocks the fixture content does not define.
 */
const mobAt = (world: World, feet: Vector3): Entity =>
    new Entity({ position: new Position(feet.getX(), feet.getY(), feet.getZ(), world) });

const nameAt = (world: World, x: number, y: number, z: number): string | undefined =>
    world.loadedBlockAt(x, y, z)?.name;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-travel-'));
});

afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('DimensionTravel.resolve', () => {
    describe('through a nether portal', () => {
        it('lands a player in the Nether at the scaled position and builds a portal there', async () => {
            const scene = await buildScene();
            await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
            expect(scene.overworld.getPortalIndex().size).toBe(6);

            const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
            const arrival = await scene.travel.resolve(player, {
                world: scene.overworld,
                position: new Vector3(80, 64, 0),
                block: 'minecraft:portal'
            });

            expect(arrival?.world).toBe(scene.nether);
            expect(arrival?.createdPortal).toBe(true);
            // 80 / 8 is 10; the Nether is all air, so the portal is forced one block back along
            // the axis with its floor clamped up to Java's 70, and the player stands in its
            // first column.
            expect(arrival?.position).toEqual(new Vector3(9.5, 70, 0.5));
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
            const arrival = await scene.travel.resolve(item, {
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
            const arrival = await scene.travel.resolve(item, {
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
            const arrival = await scene.travel.resolve(item, {
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
                await scene.travel.resolve(item, {
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

            const arrival = await scene.travel.resolve(player, {
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

            const arrival = await scene.travel.resolve(item, {
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

            const arrival = await scene.travel.resolve(player, {
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

            const arrival = await scene.travel.resolve(item, {
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
        await scene.overworld.addEntity(player);
        await scene.travel.transfer(player, {
            world: scene.nether,
            position: new Vector3(12.5, 70, 0.5),
            yaw: 0,
            pitch: 0
        });
        // Past the 10 tick cooldown, with the screen never closed.
        player.setPortalCooldown(0);

        await scene.travel.touch(player, portalAt(scene.nether, new Vector3(12, 70, 0)));

        expect(player.portalContact()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);

    it('ignores an entity on portal cooldown', async () => {
        const scene = await buildScene();
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        item.setPortalCooldown(5);

        await scene.travel.touch(item, portalAt(scene.overworld, new Vector3(80, 64, 0)));

        expect(item.portalContact()).toBeUndefined();

        await scene.level.disable();
    }, 60_000);
});

describe('DimensionTravel.transfer', () => {
    it('moves an item out of one world into the other at the arrival, on a 300 tick cooldown', async () => {
        const scene = await buildScene();
        const item = itemAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(item);

        await scene.travel.transfer(item, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(item.getWorld()).toBe(scene.nether);
        expect(item.getPosition().getX()).toBe(10.5);
        expect(item.getPosition().getY()).toBe(70);
        expect(item.yaw).toBe(90);
        expect(item.getPortalCooldown()).toBe(300);
        expect(scene.overworld.getEntities()).not.toContain(item);
        expect(scene.nether.getEntities()).toContain(item);

        await scene.level.disable();
    }, 60_000);

    it('sends a player through the session, with the 10 tick cooldown and the screen pending', async () => {
        const scene = await buildScene();
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(player);
        const seen: [World, World][] = [];
        scene.server.on('playerChangeDimension', (event) => void seen.push([event.getFrom(), event.getTo()]));

        await scene.travel.transfer(player, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(seen).toEqual([[scene.overworld, scene.nether]]);
        expect(player.getWorld()).toBe(scene.nether);
        expect(player.getPortalCooldown()).toBe(10);
        expect(player.getNetworkSession().pendingDimensionChange()?.arrival.world).toBe(scene.nether);
        expect(scene.overworld.getPlayers()).not.toContain(player);
        expect(scene.nether.getPlayers()).toContain(player);

        await scene.level.disable();
    }, 60_000);

    it('leaves a player where they are when `playerChangeDimension` is canceled', async () => {
        const scene = await buildScene();
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(player);
        scene.server.on('playerChangeDimension', (event) => event.preventDefault());

        await scene.travel.transfer(player, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.getPortalCooldown()).toBe(0);
        expect(player.getNetworkSession().pendingDimensionChange()).toBeUndefined();
        expect(scene.overworld.getPlayers()).toContain(player);

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
        const body = overworldLive.bodies.bodyOf(spawned.id);
        if (body === undefined) throw new Error('the runtime gave the traveler no body');
        const travelersIn = (world: World) => world.getEntities().filter((each) => each.getType() === TRAVELER);
        expect(travelersIn(scene.overworld)).toEqual([body]);

        await scene.travel.transfer(body, {
            world: scene.nether,
            position: new Vector3(10.5, 70, 0.5),
            yaw: 90,
            pitch: 0
        });

        expect(travelersIn(scene.overworld)).toEqual([]);
        expect(overworldLive.runtime.all()).toEqual([]);
        const arrived = travelersIn(scene.nether);
        expect(arrived).toHaveLength(1);
        const id = netherLive.bodies.entityIdOf(arrived[0]!);
        expect(id).toBeDefined();
        const restored = id === undefined ? undefined : netherLive.runtime.byId(id);
        expect(restored?.persistentIdentity).toBe(spawned.persistentIdentity);
        expect(restored?.instance.activeComponentGroups()).toContain('marked');
        expect(arrived[0]!.getPosition().getX()).toBe(10.5);
        expect(arrived[0]!.getPosition().getY()).toBe(70);
        expect(arrived[0]!.yaw).toBe(90);
        expect(arrived[0]!.getPortalCooldown()).toBe(300);

        await scene.level.disable();
    }, 60_000);
});

/** One world tick for an entity standing in a portal: the world's touch, then the entity's own update. */
const tickInPortal = async (travel: DimensionTravel, entity: Entity, portal: PortalBlockRef, tick: number) => {
    await travel.touch(entity, portal);
    await entity.update(tick);
};

describe('DimensionTravel through the tick', () => {
    it('sends anything but a player through on its first tick in a lit portal, arriving in the Nether on cooldown', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const mob = mobAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(mob);

        await tickInPortal(scene.travel, mob, portalAt(scene.overworld, new Vector3(80, 64, 0)), 1);

        expect(mob.getWorld()).toBe(scene.nether);
        expect(mob.getPosition().getY()).toBe(70);
        expect(mob.getPortalCooldown()).toBe(300);
        expect(mob.portalContact()).toBeUndefined();
        expect(scene.nether.getEntities()).toContain(mob);

        await scene.level.disable();
    }, 60_000);

    it('holds a survival player for 80 ticks, then sends them through the session', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const player = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(player);
        const portal = portalAt(scene.overworld, new Vector3(80, 64, 0));

        for (let tick = 1; tick <= 79; tick += 1) await tickInPortal(scene.travel, player, portal, tick);
        expect(player.getWorld()).toBe(scene.overworld);
        expect(player.portalContact()?.getPortalTime()).toBe(79);

        await tickInPortal(scene.travel, player, portal, 80);

        expect(player.getWorld()).toBe(scene.nether);
        expect(player.getPortalCooldown()).toBe(10);
        expect(player.getNetworkSession().pendingDimensionChange()?.arrival.world).toBe(scene.nether);
        // Bedrock creates the portal for a player: the trip built one to arrive in.
        expect(scene.nether.getPortalIndex().size).toBe(6);

        await scene.level.disable();
    }, 60_000);

    it('leaves an entity where it is when its `entityPortalEnter` is canceled, tick after tick', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        await lightPortal(scene.nether, new Vector3(12, 70, 0), 'z');
        const mob = mobAt(scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(mob);
        scene.server.on('entityPortalEnter', (event) => event.preventDefault());

        for (let tick = 1; tick <= 3; tick += 1)
            await tickInPortal(scene.travel, mob, portalAt(scene.overworld, new Vector3(80, 64, 0)), tick);

        expect(mob.getWorld()).toBe(scene.overworld);
        expect(mob.getPortalCooldown()).toBe(0);
        expect(scene.overworld.getEntities()).toContain(mob);

        await scene.level.disable();
    }, 60_000);

    it('takes a bot standing in a hand-built portal to the Nether world through `World.update` alone', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(bot);

        for (let tick = 1; tick <= 80; tick += 1) await scene.overworld.update(tick);

        expect(bot.getWorld()).toBe(scene.nether);
        expect(scene.overworld.getPlayers()).not.toContain(bot);
        expect(scene.nether.getPlayers()).toContain(bot);

        await scene.level.disable();
    }, 60_000);

    it('does not start a second trip for a bot that sits on the loading screen inside the arrival portal', async () => {
        const scene = await buildScene();
        await lightPortal(scene.overworld, new Vector3(80, 64, 0), 'x');
        const bot = playerAt(scene.server, scene.overworld, new Vector3(80.5, 64, 0.5));
        await scene.overworld.addEntity(bot);
        for (let tick = 1; tick <= 80; tick += 1) await scene.overworld.update(tick);
        const pending = bot.getNetworkSession().pendingDimensionChange();
        expect(pending?.arrival.world).toBe(scene.nether);
        expect(scene.nether.getPortalIndex().has({ x: 9, y: 70, z: 0 })).toBe(true);
        const entered: Entity[] = [];
        scene.server.on('entityPortalEnter', (event) => void entered.push(event.getEntity()));

        // The bot stands in the portal the trip built. Its 10 tick cooldown runs out while the
        // client has still not closed the screen, and the Nether keeps ticking it.
        // Stood in the portal by hand: `changeWorld` writes the arrival, which is a feet
        // position, as the player's eye position, so the bot would otherwise arrive 1.62
        // blocks down in the obsidian floor. That is a separate defect from the one here.
        await bot.setPosition(
            { position: Position.fromVector3(eyePositionAt(new Vector3(9.5, 70, 0.5)), scene.nether) },
            false
        );
        for (let tick = 81; tick <= 180; tick += 1) await scene.nether.update(tick);

        // The world never dispatched a touch for the bot, so no contact and no event.
        expect(entered).toEqual([]);
        expect(bot.getWorld()).toBe(scene.nether);
        expect(bot.portalContact()).toBeUndefined();
        expect(bot.getNetworkSession().pendingDimensionChange()).toBe(pending);
        expect(scene.nether.getPlayers()).toContain(bot);

        await scene.level.disable();
    }, 60_000);
});
