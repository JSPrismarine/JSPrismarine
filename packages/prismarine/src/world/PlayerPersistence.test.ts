/**
 * A player logging out and back in, through a real world and a real LevelDB.
 *
 * Nothing persisted a player's items before `WorldPlayerData.inventory` existed, so this is
 * the regression test for the whole chain: `World.savePlayerData` collects what the player is
 * carrying, the LevelDB provider writes it as Bedrock item NBT under `player_server_<key>`,
 * and `Player.enable` puts it back. No mock provider, because a mock would have round-tripped
 * the record as a JavaScript object and said nothing about the NBT it has to survive.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Console from '../Console';
import ContainerEntry from '../inventory/ContainerEntry';
import type { Logger } from '@jsprismarine/logger';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Item } from '../item/Item';
import type ClientConnection from '../network/ClientConnection';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import type { PermissionManager } from '../permission/PermissionManager';
import Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type { ChunkScheduler } from './ChunkScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import { Position } from './Position';
import LevelDB from './providers/leveldb/LevelDB';
import type Server from '../Server';
import type WorldManager from './WorldManager';
import type { World } from './World';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import type { Level } from './Level';
import { testLevel } from '../testing/level';

const WORLD_NAME = 'persistence';

/** The slot the pickaxe goes in, so the test proves a slot index survives rather than a count. */
const PICKAXE_SLOT = 7;

/** Where the shulker box sits, which is a slot holding a container of its own. */
const BOX_SLOT = 8;

let scratch: string;
let previousDirectory: string | undefined;

const testServer = (worlds: () => World[] = () => []): Server => {
    const server: Server = stub<Server>({
        // A login now looks for the player's record in every loaded world, because each world
        // keeps its own: see `lastPlayerRecord`.
        getWorldManager: () => stub<WorldManager>({ getWorlds: () => worlds() }),
        on: () => server,
        post: () => 0,
        emit: async () => {},
        getTick: () => 0,
        getConsole: () => stub<Console>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [] }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime(),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getPreloadRadius: () => 0,
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4
            })
    });

    return server;
};

/** Empty chunks: this test never looks at a block. */
const generator = (): Generator => ({
    generateChunk: async (cx: number, cz: number) => new Chunk(cx, cz, new Map(), Dimensions.Overworld)
});

/**
 * A level over the one world folder, with its spawn already known so that opening the Overworld
 * generates nothing.
 */
const buildLevel = (server: Server): Level => {
    const folder = path.join(scratch, 'worlds', WORLD_NAME);
    return testLevel({
        name: WORLD_NAME,
        path: folder,
        server,
        provider: new LevelDB(folder, server),
        generator: generator(),
        spawn: new Vector3(0, 64, 0)
    });
};

/** A player of a fixed identity, so the second one reads the first one's record. */
const buildPlayer = (world: World, server: Server, uuid: UUID): Player => {
    const player = new Player({
        position: new Position(0.5, 65, 0.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid,
            name: 'Tester',
            // Deliberately empty: an offline player has no XUID, and the save used to be
            // skipped entirely for one.
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

/** The pickaxe the test follows: enchanted, damaged, renamed and given a lore line. */
const pickaxe = (): Item => {
    const stack = new Item({ name: 'minecraft:diamond_pickaxe', count: 1 })
        .withEnchantments({ 'minecraft:efficiency': 4, 'minecraft:silk_touch': 1, 'minecraft:sweeping_edge': 2 })
        .withDisplay('Hole Maker', ['Property of the test suite']);

    stack.durability = stack.getMaxDurability() - 37;
    return stack;
};

/** Logs a player out of a world and brings a fresh one back into it. */
const logOutAndIn = async () => {
    let built: World | undefined;
    const server = testServer(() => (built === undefined ? [] : [built]));
    const level = buildLevel(server);
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);
    built = world;

    const uuid = UUID.fromRandom();
    const leaving = buildPlayer(world, server, uuid);
    const inventory = leaving.getInventory();

    inventory.setItem(PICKAXE_SLOT, new ContainerEntry({ item: pickaxe(), count: 1 }));
    inventory.setHandSlot(PICKAXE_SLOT);
    inventory
        .getArmor()
        .setItem(1, new ContainerEntry({ item: new Item({ name: 'minecraft:iron_chestplate' }), count: 1 }));
    inventory.getOffhand().setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:shield' }), count: 1 }));
    inventory
        .getEnderChest()
        .setItem(26, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 12 }), count: 12 }));
    inventory.setItem(
        BOX_SLOT,
        new ContainerEntry({
            item: new Item({ name: 'minecraft:black_shulker_box' }).withContents([null, pickaxe()]),
            count: 1
        })
    );

    leaving.attributes.setValue(AttributeIds.Health, 11);
    leaving.setFood(13);
    leaving.setSaturation(4);
    leaving.attributes.setValue(AttributeIds.PlayerLevel, 27);
    leaving.attributes.setValue(AttributeIds.PlayerExperience, 0.5);
    await leaving.setPosition({ position: new Vector3(12.5, 70, -8.5) }, false);

    await world.savePlayerData(leaving);

    // A fresh process would reopen the database; a second level over the same folder is the
    // same thing without the process.
    await level.disable();
    const reopened = buildLevel(server);
    await reopened.enable();
    const back = await reopened.world(OVERWORLD_STEM_ID);
    built = back;

    const returning = buildPlayer(back, server, uuid);
    await returning.enable();

    await reopened.disable();
    return returning;
};

describe('a player logging out and back in', () => {
    let returning: Player;

    beforeAll(async () => {
        previousDirectory = process.env.JSP_DIR;
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-player-'));
        process.env.JSP_DIR = scratch;

        returning = await logOutAndIn();
    }, 60_000);

    afterAll(() => {
        if (previousDirectory === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDirectory;

        fs.rmSync(scratch, { recursive: true, force: true });
    });

    it('comes back holding the same stack, in the same slot', () => {
        const inventory = returning.getInventory();

        expect(inventory.getHandSlotIndex()).toBe(PICKAXE_SLOT);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_pickaxe');
        expect(inventory.getItem(PICKAXE_SLOT).getAmount()).toBe(1);
    });

    it('keeps the enchantments, including one no Bedrock number names', () => {
        const held = returning.getInventory().getItemInHand();

        expect(Object.fromEntries(held.getEnchantments())).toEqual({
            'minecraft:efficiency': 4,
            'minecraft:silk_touch': 1,
            'minecraft:sweeping_edge': 2
        });
        expect(held.hasEnchantment('silk_touch')).toBe(true);
    });

    it('keeps the damage, the name and the lore', () => {
        const held = returning.getInventory().getItemInHand();

        expect(held.getMaxDurability() - held.getDurability()).toBe(37);
        expect(held.getCustomName()).toBe('Hole Maker');
        expect(held.getLore()).toEqual(['Property of the test suite']);
    });

    it('keeps what a shulker box in the inventory was holding', () => {
        const box = returning.getInventory().getItem(BOX_SLOT);

        expect(box.getName()).toBe('minecraft:black_shulker_box');
        // The empty slot before it is kept too, so the box opens with its stacks where they
        // were rather than shuffled up to the front.
        expect(box.getContents()[0]).toBeNull();

        const held = box.getContents()[1];
        expect(held?.getName()).toBe('minecraft:diamond_pickaxe');
        expect(held?.getEnchantmentLevel('minecraft:sweeping_edge')).toBe(2);
        expect(held?.getCustomName()).toBe('Hole Maker');
        expect((held?.getMaxDurability() ?? 0) - (held?.getDurability() ?? 0)).toBe(37);
    });

    it('keeps the armor, the off hand and the ender chest', () => {
        const inventory = returning.getInventory();

        expect(inventory.getArmor().getItem(1).getName()).toBe('minecraft:iron_chestplate');
        expect(inventory.getOffhand().getItem(0).getName()).toBe('minecraft:shield');
        expect(inventory.getEnderChest().getItem(26).getName()).toBe('minecraft:diamond');
        expect(inventory.getEnderChest().getItem(26).getAmount()).toBe(12);
    });

    it('keeps health, food, saturation and experience', () => {
        expect(returning.getHealth()).toBe(11);
        expect(returning.getFood()).toBe(13);
        expect(returning.getSaturation()).toBe(4);
        expect(returning.attributes.getValue(AttributeIds.PlayerLevel)).toBe(27);
        expect(returning.attributes.getValue(AttributeIds.PlayerExperience)).toBeCloseTo(0.5, 5);
    });

    it('comes back where it left, rather than at the spawn point', () => {
        const position = returning.getPosition();

        expect(position.getX()).toBeCloseTo(12.5, 5);
        expect(position.getZ()).toBeCloseTo(-8.5, 5);
    });
});
