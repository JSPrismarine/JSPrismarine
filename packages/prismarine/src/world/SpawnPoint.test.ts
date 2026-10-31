/**
 * A player setting their own spawn point and coming back at it, through a real world.
 *
 * Nothing modeled a per-player spawn before this: `Player.getRespawnPoint` answered with the
 * world spawn for everybody, a bed set nothing, and `/spawnpoint` was one of the commands the
 * registry left out because there was nothing behind it.
 *
 * So the three paths that set one are driven here against a real `World` and a real LevelDB: the
 * click on the bed goes through `useItemOnBlock`, the command goes through the server's own
 * `WorldCommandHost`, and the record goes out through `savePlayerData` and back in through
 * `Player.enable`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import type { BlockStateDefinition } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { entityRefOf } from '../command/host/support';
import { worldCommandHost } from '../command/host/world';
import type { Config } from '../config/Config';
import type Console from '../Console';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import type { ServerWorldHandle } from '../content/world/serverSource';
import { serverWorldSource } from '../content/world/serverSource';
import { useItemOnBlock } from '../item/interaction';
import type ClientConnection from '../network/ClientConnection';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import type { PermissionManager } from '../permission/PermissionManager';
import Player from '../Player';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type { ChunkScheduler } from './ChunkScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import { Position } from './Position';
import LevelDB from './providers/leveldb/LevelDB';
import type { World } from './World';
import type WorldManager from './WorldManager';
import { inertEntityRuntime } from '../testing/entityServer';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { testLevel } from '../testing/level';

/** Where the bed stands, with the ground under it and nothing above. */
const BED = { x: 10, y: 64, z: 10 };

/** Where the world spawn is, which is where a lost spawn point sends a player. */
const WORLD_SPAWN = new Vector3(0, 70, 0);

/** The blocks this file places, which the fixture content has to declare. */
const BLOCKS = ['minecraft:air', 'minecraft:bed', 'minecraft:stone'] as const;

/** The real catalog gives a bed two states, so the fixture has to as well. */
const STATES_OF: Readonly<Record<string, readonly BlockStateDefinition[]>> = {
    'minecraft:bed': [
        { name: 'direction', type: 'int', values: [0, 1, 2, 3], defaultValue: 0 },
        { name: 'head_piece_bit', type: 'bool', values: [false, true], defaultValue: false },
        { name: 'occupied_bit', type: 'bool', values: [false, true], defaultValue: false }
    ]
};

/**
 * One block file in the shape the `jsprismarine_vanilla` overlay writes.
 *
 * Air gets an empty collision box, because a block with no `minecraft:collision_box` component
 * is solid and a solid air block means a player can never stand anywhere.
 */
const blockFile = (identifier: string): unknown => ({
    format_version: '1.26.20',
    'minecraft:block': {
        description: { identifier },
        components: {
            ...(identifier === 'minecraft:air'
                ? { 'minecraft:collision_box': false, 'minecraft:light_dampening': 0 }
                : {}),
            'minecraft:destructible_by_mining': { seconds_to_destroy: 0.2 },
            'minecraft:destructible_by_explosion': { explosion_resistance: 1 },
            'minecraft:light_emission': 0,
            'minecraft:light_dampening': 15,
            'minecraft:friction': 0.6,
            'jsprismarine:block_properties': {
                friction: 0.6,
                random_tick: false,
                requires_correct_tool: false,
                push_reaction: 'push_pull',
                source: 'java'
            }
        }
    }
});

let scratch: string;
let previousDirectory: string | undefined;

const generator = (): Generator => ({
    generateChunk: async (cx: number, cz: number) => new Chunk(cx, cz, new Map(), Dimensions.Overworld)
});

/** A server with one world, its content built over it, and the two managers a break reads. */
const buildScene = async (name: string) => {
    const folder = path.join(scratch, 'worlds', name);
    let world: World | undefined;
    let content: ServerContent | undefined;

    const server: Server = stub<Server>({
        on: () => server,
        post: () => 0,
        emit: async () => {},
        getTick: () => 0,
        getRandom: () => () => 0.5,
        getConsole: () => stub<Console>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [] }),
        getContent: () => {
            if (content === undefined) throw new Error('the content was read before it was built');
            return content;
        },
        getEntityRuntime: () => inertEntityRuntime(),
        getWorldManager: () =>
            stub<WorldManager>({
                getWorlds: () => (world === undefined ? [] : [world]),
                getWorldByDimension: (dimension) => (dimension === Dimensions.Overworld.id ? world : undefined),
                getDefaultWorld: () => world!
            }),
        broadcastPacket: async () => {},
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getPreloadRadius: () => 0,
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4,
                getDifficulty: () => 2
            })
    });

    // The spawn is known before the world opens, so enabling it searches for nothing.
    const level = testLevel({
        name,
        path: folder,
        server,
        provider: new LevelDB(folder, server),
        generator: generator(),
        spawn: WORLD_SPAWN
    });
    await level.enable();
    world = await level.world(OVERWORLD_STEM_ID);

    const contentWorld: ServerWorldHandle = serverWorldSource({
        worldFor: () => world,
        content: () => {
            if (content === undefined) throw new Error('the content world was read before the content was built');
            return content;
        },
        seed: 1234n,
        difficulty: () => 2
    });

    content = buildServerContent({
        world: contentWorld,
        load: () => ({
            definitions: definitionsOf({
                blocks: new Map(BLOCKS.map((id) => [id, definitionOf('blocks', id, blockFile(id))]))
            }),
            diagnostics: []
        }),
        blockPalette: new BlockPalette(BLOCKS.map((id) => [id, new BlockStateModel(STATES_OF[id] ?? [])])),
        itemDefinitions: vanillaItemDefinitions().filter((definition) =>
            (BLOCKS as readonly string[]).includes(definition.identifier)
        )
    });

    await world.getChunk(0, 0);

    return {
        server,
        world,
        level,
        content,
        contentWorld,
        blocks: content.world.blockWorld.at('minecraft:overworld')
    };
};

/** A player standing beside the bed, wired to a session that sends nowhere. */
const buildPlayer = (world: World, server: Server, uuid: UUID): Player => {
    const player = new Player({
        position: new Position(BED.x + 0.5, BED.y, BED.z + 2.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid,
            name: 'Sleeper',
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
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });

    createConnectedPlayer({ server, connection, player });
    return player;
};

/** One right click on the top of a block, through the real interaction path. */
const clickOn = (scene: Awaited<ReturnType<typeof buildScene>>, player: Player, at: typeof BED) =>
    useItemOnBlock({
        content: scene.content,
        actors: scene.contentWorld.actorsAt('minecraft:overworld'),
        player,
        position: at,
        // Face 1 is the top, which is where a player clicks a bed from.
        face: 1,
        faceLocation: { x: 0.5, y: 1, z: 0.5 }
    });

describe('a player with a spawn point of their own', () => {
    beforeAll(() => {
        previousDirectory = process.env.JSP_DIR;
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-spawn-'));
        process.env.JSP_DIR = scratch;
    });

    afterAll(() => {
        if (previousDirectory === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDirectory;

        fs.rmSync(scratch, { recursive: true, force: true });
    });

    it('comes back beside the bed it was set from, and at the world spawn once the bed is gone', async () => {
        const scene = await buildScene('bed');
        const player = buildPlayer(scene.world, scene.server, UUID.fromRandom());

        scene.blocks.setBlock(BED, 'minecraft:bed');
        expect(clickOn(scene, player, BED)).toBe('handled');
        expect(player.getSpawnPoint()).toEqual({ ...BED, dimension: 'minecraft:overworld' });

        // Beside the bed, in the first free column around it, rather than in the bed itself.
        const beside = await player.getRespawnPoint();
        expect([beside.block.getX(), beside.block.getY(), beside.block.getZ()]).toEqual([BED.x, BED.y, BED.z + 1]);

        // Java's "your home bed was missing or obstructed": the point stops being used and the
        // player goes back to the world spawn.
        scene.blocks.setBlock(BED, 'minecraft:stone');
        const fallback = await player.getRespawnPoint();
        expect([fallback.block.getX(), fallback.block.getY(), fallback.block.getZ()]).toEqual([0, 70, 0]);
        expect(player.getSpawnPoint()).toBeUndefined();

        await scene.level.disable();
    }, 120_000);

    it('honors a point /spawnpoint set whatever is standing there', async () => {
        const scene = await buildScene('command');
        const player = buildPlayer(scene.world, scene.server, UUID.fromRandom());
        await scene.world.addEntity(player);

        const host = worldCommandHost(scene.server);
        const set = host.setSpawnPoint(entityRefOf(player), 'minecraft:overworld', { x: 32, y: 65, z: -17 }, 0);

        expect(set).toBe(true);
        expect(player.getSpawnPoint()).toEqual({
            x: 32,
            y: 65,
            z: -17,
            dimension: 'minecraft:overworld',
            forced: true
        });

        // Nothing stands at (32, 65, -17) and the point is used anyway, which is what Java's
        // forced spawn means.
        const point = await player.getRespawnPoint();
        expect([point.block.getX(), point.block.getY(), point.block.getZ()]).toEqual([32, 65, -17]);

        await scene.level.disable();
    }, 120_000);

    it('moves the world spawn through /setworldspawn, which is where a player with no point goes', async () => {
        const scene = await buildScene('worldspawn');
        const player = buildPlayer(scene.world, scene.server, UUID.fromRandom());

        const host = worldCommandHost(scene.server);
        expect(host.setWorldSpawn('minecraft:overworld', { x: -8, y: 72, z: 44 }, 0)).toBe(true);
        expect(await scene.world.getSpawnPosition()).toEqual(new Vector3(-8, 72, 44));

        // A player with no point of their own comes back at it.
        expect(player.getSpawnPoint()).toBeUndefined();
        const point = await player.getRespawnPoint();
        expect([point.block.getX(), point.block.getY(), point.block.getZ()]).toEqual([-8, 72, 44]);

        await scene.level.disable();
    }, 120_000);

    it('keeps the point across a logout, through the player record', async () => {
        const uuid = UUID.fromRandom();

        const leaving = await buildScene('persist');
        const player = buildPlayer(leaving.world, leaving.server, uuid);
        leaving.blocks.setBlock(BED, 'minecraft:bed');
        clickOn(leaving, player, BED);

        await leaving.world.savePlayerData(player);
        await leaving.world.save();
        await leaving.level.disable();

        const returning = await buildScene('persist');
        const back = buildPlayer(returning.world, returning.server, uuid);
        await back.enable();

        expect(back.getSpawnPoint()).toEqual({ ...BED, dimension: 'minecraft:overworld' });

        const point = await back.getRespawnPoint();
        expect([point.block.getX(), point.block.getY(), point.block.getZ()]).toEqual([BED.x, BED.y, BED.z + 1]);

        await returning.level.disable();
    }, 120_000);
});
