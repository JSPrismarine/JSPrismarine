import { KernelEventBus } from '@jsprismarine/kernel';
import type { ServerEvents } from '../events/ServerEvents';
/**
 * A player logging out and back in, through a real world and a real LevelDB.
 *
 * Nothing persisted a player's items before `WorldPlayerData.inventory` existed, so this is
 * the regression test for the whole chain: `World.savePlayerData` collects what the player is
 * carrying, the LevelDB provider writes it as Bedrock item NBT under `player_server_<key>`,
 * and `PlayerSession.join` puts it back. No mock provider, because a mock would have round-tripped
 * the record as a JavaScript object and said nothing about the NBT it has to survive.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { InetAddress } from '@jsprismarine/raknet';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import type Console from '../Console';
import ContainerEntry from '../inventory/ContainerEntry';
import type { Logger } from '@jsprismarine/logger';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Item } from '../item/Item';
import type ClientConnection from '../network/ClientConnection';
import { connectedSession, sessionsWith } from '../testing/playerSession.test.helper';
import type { PermissionManager } from '../permission/PermissionManager';
import type PlayerSession from '../network/PlayerSession';
import { stub } from '../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type { ChunkScheduler } from './ChunkScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import LevelDB from './providers/leveldb/LevelDB';
import type Server from '../Server';
import type WorldManager from './WorldManager';
import type { World } from './World';
import { liveTestEntities } from '../testing/entityServer';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import type { Level } from './Level';
import { testLevel } from '../testing/level';
import { ChunkCompletionQueue } from './ChunkCompletionQueue';
import { ChatManager } from '../chat/ChatManager';

const WORLD_NAME = 'persistence';

/** The slot the pickaxe goes in, so the test proves a slot index survives rather than a count. */
const PICKAXE_SLOT = 7;

/** Where the shulker box sits, which is a slot holding a container of its own. */
const BOX_SLOT = 8;

let scratch: string;
let previousDirectory: string | undefined;

/**
 * A server double over real entity runtimes, which hold the players `World.addPlayer` enters.
 * @param world - The world the runtimes' actors show their entities in, read at call time.
 */
const testServer = (world: () => World | undefined = () => undefined): Server => {
    const sessions = sessionsWith();
    const entities = liveTestEntities(world);
    const server: Server = stub<Server>({
        getSessionManager: () => sessions,
        getChatManager: () => chat,
        getWorldManager: () => stub<WorldManager>({}),
        on: () => server,
        post: () => 0,
        emit: async () => {},
        getTick: () => 0,
        getConsole: () => stub<Console>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [] }),
        getContent: () => entities.content(),
        getEntityRuntime: (dimension) => entities.entityRuntime(dimension),
        getStorePlayers: () => entities.players,
        getChunkCompletionQueue: () => new ChunkCompletionQueue(),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getPreloadRadius: () => 0,
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4
            })
    });
    const chat = new ChatManager(new KernelEventBus<ServerEvents>());

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
const buildLevel = (server: Server, name = WORLD_NAME, worldGenerator = generator()): Level => {
    const folder = path.join(scratch, 'worlds', name);
    return testLevel({
        name,
        path: folder,
        server,
        provider: new LevelDB(folder, server),
        generator: worldGenerator,
        spawn: new Vector3(0, 64, 0)
    });
};

const digestWithInsertionOrder = async (
    name: string,
    chunkOrder: Array<[number, number]>,
    reverseEntityInsertion: boolean
): Promise<string> => {
    let opened: World | undefined;
    const server = testServer(() => opened);
    const level = buildLevel(server, name);
    await level.enable();

    try {
        const world = await level.world(OVERWORLD_STEM_ID);
        opened = world;
        for (const [x, z] of chunkOrder) await world.loadChunk(x, z);

        const first = buildPlayer(world, server, UUID.fromString('00000000-0000-4000-8000-000000000001'));
        const second = buildPlayer(world, server, UUID.fromString('00000000-0000-4000-8000-000000000002'));
        // Build the players in runtime-id order, then reverse their entry to test canonical sorting.
        // No mob: a store mob draws a fresh persistent identity at its spawn, so two levels never
        // hash one the same. `WorldReplayState.test.ts` covers how a mob is hashed.
        const addFirst = () => world.addPlayer(first);
        const addSecond = () => world.addPlayer(second);
        const additions = reverseEntityInsertion ? [addSecond, addFirst] : [addFirst, addSecond];
        for (const add of additions) await add();

        return world.replayStateDigest();
    } finally {
        await level.disable();
    }
};

/**
 * A player of a fixed identity, so the second one reads the first one's record. Its name is the
 * same, and it has no XUID: an offline player has none, and the save used to be skipped entirely
 * for one.
 */
const buildPlayer = (world: World, server: Server, uuid: UUID): PlayerSession => {
    const connection = stub<ClientConnection>({
        getAddress: () => new InetAddress('127.0.0.1', 19132),
        sendDataPacket: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });
    return connectedSession({
        server,
        connection,
        world,
        eyes: new Vector3(0.5, 65, 0.5),
        name: 'Tester',
        uuid,
        joined: false
    });
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
    let opened: World | undefined;
    const server = testServer(() => opened);
    const level = buildLevel(server);
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);
    opened = world;
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
    leaving.getPlayer().setFood(13);
    leaving.getPlayer().setSaturation(4);
    leaving.attributes.setValue(AttributeIds.PlayerLevel, 27);
    leaving.attributes.setValue(AttributeIds.PlayerExperience, 0.5);
    leaving.getPlayer().setSeenCredits(true);
    await leaving.setPlayerPosition({ position: new Vector3(12.5, 70, -8.5) }, false);

    await world.savePlayerData(leaving.getPlayer());

    // A fresh process would reopen the database; a second level over the same folder is the
    // same thing without the process.
    await level.disable();
    const reopened = buildLevel(server);
    await reopened.enable();
    const back = await reopened.world(OVERWORLD_STEM_ID);
    opened = back;

    const returning = buildPlayer(back, server, uuid);
    await returning.join();
    await back.addPlayer(returning);

    const returningInventory = returning.getInventory();
    const original = returningInventory.getEntry(0);
    const baselineDigest = back.replayStateDigest();
    returningInventory.setCursor(new Item({ name: 'minecraft:diamond', count: 1 }));
    const oneCursorDigest = back.replayStateDigest();
    returningInventory.setCursor(new Item({ name: 'minecraft:diamond', count: 2 }));
    const twoCursorDigest = back.replayStateDigest();
    returningInventory.setCursor(null);
    const clearedCursorDigest = back.replayStateDigest();
    returningInventory.setItem(
        0,
        new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 1 }), count: 1 })
    );
    const oneStackDigest = back.replayStateDigest();
    returningInventory.setItem(
        0,
        new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 2 }), count: 2 })
    );
    const duplicatedStackDigest = back.replayStateDigest();
    returningInventory.setItem(
        0,
        new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 1 }), count: 2 })
    );
    const mismatchedStackDigest = back.replayStateDigest();
    if (original === null) returningInventory.removeItem(0);
    else returningInventory.setItem(0, original);
    const restoredDigest = back.replayStateDigest();

    await reopened.disable();
    return {
        returning,
        digests: {
            baselineDigest,
            oneCursorDigest,
            twoCursorDigest,
            clearedCursorDigest,
            oneStackDigest,
            duplicatedStackDigest,
            mismatchedStackDigest,
            restoredDigest
        }
    };
};

describe('a player logging out and back in', () => {
    let returning: PlayerSession;
    let digests: Awaited<ReturnType<typeof logOutAndIn>>['digests'];

    beforeAll(async () => {
        previousDirectory = process.env.JSP_DIR;
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-player-'));
        process.env.JSP_DIR = scratch;

        const result = await logOutAndIn();
        returning = result.returning;
        digests = result.digests;
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

    it('changes the world digest when a player stack is duplicated', () => {
        expect(digests.oneStackDigest).not.toBe(digests.baselineDigest);
        expect(digests.duplicatedStackDigest).not.toBe(digests.oneStackDigest);
        expect(digests.mismatchedStackDigest).not.toBe(digests.duplicatedStackDigest);
        expect(digests.restoredDigest).toBe(digests.baselineDigest);
    });

    it('includes the transient cursor in the world digest', () => {
        expect(digests.oneCursorDigest).not.toBe(digests.baselineDigest);
        expect(digests.twoCursorDigest).not.toBe(digests.oneCursorDigest);
        expect(digests.clearedCursorDigest).toBe(digests.baselineDigest);
    });

    it('keeps the replay digest independent of chunk and entity insertion order', async () => {
        // The equal X coordinates exercise Z sorting; the different X coordinate exercises X sorting.
        const first = await digestWithInsertionOrder(
            'digest-first',
            [
                [1, 0],
                [0, 1],
                [0, 0]
            ],
            false
        );
        const reordered = await digestWithInsertionOrder(
            'digest-reordered',
            [
                [0, 0],
                [0, 1],
                [1, 0]
            ],
            true
        );

        expect(reordered).toBe(first);
    });

    it('includes a chunk load that has started but has not entered the world', async () => {
        const server = testServer();
        let finishGeneration: ((chunk: Chunk) => void) | undefined;
        const generated = new Promise<Chunk>((resolve) => {
            finishGeneration = resolve;
        });
        const delayedGenerator: Generator = { generateChunk: async () => generated };
        const level = buildLevel(server, 'digest-pending-chunk', delayedGenerator);
        await level.enable();

        try {
            const world = await level.world(OVERWORLD_STEM_ID);
            const beforeLoad = world.replayStateDigest();
            const loading = world.loadChunk(9, -4);
            const whileLoading = world.replayStateDigest();

            finishGeneration?.(new Chunk(9, -4, new Map(), Dimensions.Overworld));
            await loading;

            expect(whileLoading).not.toBe(beforeLoad);
            expect(world.replayStateDigest()).not.toBe(whileLoading);
        } finally {
            await level.disable();
        }
    });

    it('fails replay capture when an online player record could not be saved', async () => {
        const server = testServer();
        const level = buildLevel(server, 'capture-player-save-failure');
        await level.enable();

        try {
            const world = await level.world(OVERWORLD_STEM_ID);
            const player = buildPlayer(world, server, UUID.fromString('00000000-0000-4000-8000-000000000003'));
            const getViewers = vi.spyOn(world, 'getViewers').mockReturnValue([player]);

            const failure = new Error('player write failed');
            const writePlayerData = vi.spyOn(level.getProvider(), 'writePlayerData').mockRejectedValue(failure);
            try {
                await expect(level.captureReplayInitialState()).rejects.toBe(failure);
            } finally {
                writePlayerData.mockRestore();
                getViewers.mockRestore();
            }
        } finally {
            await level.disable();
        }
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
        expect(returning.getPlayer().getHealth()).toBe(11);
        expect(returning.getPlayer().getFood()).toBe(13);
        expect(returning.getPlayer().getSaturation()).toBe(4);
        expect(returning.attributes.getValue(AttributeIds.PlayerLevel)).toBe(27);
        expect(returning.attributes.getValue(AttributeIds.PlayerExperience)).toBeCloseTo(0.5, 5);
    });

    it('keeps that the end credits were seen', () => {
        expect(returning.getPlayer().hasSeenCredits()).toBe(true);
    });

    it('comes back where it left, rather than at the spawn point', () => {
        const position = returning.getPosition();

        expect(position.getX()).toBeCloseTo(12.5, 5);
        expect(position.getZ()).toBeCloseTo(-8.5, 5);
    });
});
