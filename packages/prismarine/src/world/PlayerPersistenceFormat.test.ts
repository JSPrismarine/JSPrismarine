/**
 * The saved player record, byte for byte.
 *
 * The fixtures under `__fixtures__/` were written by the record code as it stood before the
 * player persistence service took it over: the LevelDB value under `player_server_<key>` and
 * the fallback JSON file a provider without player storage gets. A record in either form has to
 * load, and the same player state has to write the same bytes, so a save written before the
 * service and one written after it are interchangeable.
 *
 * A store player (`entity/storePlayer.ts`) holding the same state writes the same bytes and loads
 * back from them, so the record is the same projection of a live player and a store entity.
 *
 * `JSP_UPDATE_PLAYER_RECORD_FIXTURES=1` rewrites the fixtures. Do that only for a deliberate
 * format change, which every existing save then has to survive.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Database, WriteBatch } from '@jsprismarine/leveldb';
import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { InetAddress } from '@jsprismarine/raknet';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerAdvancements } from '@jsprismarine/advancements';

import { advancementsOf, forgetAdvancements, loadAdvancements } from '../advancement/progress';
import type { Config } from '../config/Config';
import type Console from '../Console';
import { enchantmentSeedOf, forgetEnchantmentSeed } from '../enchantment/enchantingTable';
import { entityFixture } from '../entity/data/testing';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
import type { StorePlayer } from '../entity/storePlayer';
import { enteredStorePlayer } from '../testing/storePlayer.test.helper';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import type ClientConnection from '../network/ClientConnection';
import { connectedSession, sessionsWith } from '../testing/playerSession.test.helper';
import type { PermissionManager } from '../permission/PermissionManager';
import type PlayerSession from '../network/PlayerSession';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { testLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import { StorePlayers } from '../entity/data/storePlayers';
import Chunk from './chunk/Chunk';
import { ChunkCompletionQueue } from './ChunkCompletionQueue';
import type { ChunkScheduler } from './ChunkScheduler';
import { Dimensions } from './Dimension';
import type { Level } from './Level';
import LevelDB from './providers/leveldb/LevelDB';
import { encodePlayerServerKey } from './providers/leveldb/LevelDBKeys';
import type { World } from './World';
import { applyPlayerRecord, playerRecordFrom, recordedPosition } from './playerRecord';
import type { PlayerServiceState } from './playerRecord';
import type WorldManager from './WorldManager';
import { ChatManager } from '../chat/ChatManager';

const FIXTURES = path.join(import.meta.dirname, '__fixtures__');
const LEVELDB_FIXTURE = path.join(FIXTURES, 'player-record.leveldb.bin');
const JSON_FIXTURE = path.join(FIXTURES, 'player-record.json');
const UPDATE = process.env.JSP_UPDATE_PLAYER_RECORD_FIXTURES === '1';

/** The player both fixtures describe: no XUID, so the record is filed under the name. */
const NAME = 'Recorded';
const KEY = NAME;
const IDENTITY = UUID.fromString('0f1e2d3c-4b5a-4968-8776-655443322110');

/** The moment the record says it was saved, since `savedAt` is a wall-clock stamp. */
const SAVED_AT = new Date('2026-11-10T12:00:00.000Z');

let scratch: string;
let previousDirectory: string | undefined;

/** Every player a test built, released after it so no per-player state carries into the next. */
const built: PlayerSession[] = [];

beforeEach(() => {
    previousDirectory = process.env.JSP_DIR;
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-record-'));
    process.env.JSP_DIR = scratch;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SAVED_AT);
});

afterEach(() => {
    for (const session of built.splice(0)) session.disable();
    vi.useRealTimers();
    if (previousDirectory === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDirectory;
    fs.rmSync(scratch, { recursive: true, force: true });
});

const testServer = (): Server => {
    const sessions = sessionsWith();
    const storePlayers = new StorePlayers();
    const server: Server = stub<Server>({
        getSessionManager: () => sessions,
        getStorePlayers: () => storePlayers,
        getChatManager: () => chat,
        getWorldManager: () => stub<WorldManager>({}),
        on: () => server,
        removeListener: () => server,
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
    const chat = new ChatManager(server);
    return server;
};

/** A level over one folder. `fileRecords` takes the provider's player storage away. */
const buildLevel = (server: Server, folder: string, fileRecords = false): Level => {
    const provider = new LevelDB(folder, server);
    if (fileRecords) Object.assign(provider, { readPlayerData: undefined, writePlayerData: undefined });
    return testLevel({
        name: 'record',
        path: folder,
        server,
        provider,
        generator: {
            generateChunk: async (cx: number, cz: number) => new Chunk(cx, cz, new Map(), Dimensions.Overworld)
        },
        spawn: new Vector3(0, 64, 0)
    });
};

const buildPlayer = (world: World, server: Server): PlayerSession => {
    const connection = stub<ClientConnection>({
        getAddress: () => new InetAddress('127.0.0.1', 19132),
        sendDataPacket: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });
    const session = connectedSession({
        server,
        connection,
        world,
        eyes: new Vector3(0.5, 65, 0.5),
        name: NAME,
        uuid: IDENTITY,
        joined: false
    });
    built.push(session);
    return session;
};

/** The player state both fixtures hold. */
const giveState = async (session: PlayerSession): Promise<void> => {
    const player = session.getPlayer();
    const inventory = player.getInventory();
    const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', count: 1 })
        .withEnchantments({ 'minecraft:efficiency': 4 })
        .withDisplay('Hole Maker', ['Property of the test suite']);
    pickaxe.durability = pickaxe.getMaxDurability() - 37;
    inventory.setItem(3, new ContainerEntry({ item: pickaxe, count: 1 }));
    inventory.setHandSlot(3);
    inventory.getOffhand().setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:shield' }), count: 1 }));
    inventory
        .getEnderChest()
        .setItem(5, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 9 }), count: 9 }));

    player.attributes.setValue(AttributeIds.Health, 11);
    player.setFood(13);
    player.setSaturation(4);
    player.attributes.setValue(AttributeIds.PlayerLevel, 27);
    player.setSeenCredits(true);
    player.setPortalCooldown(40);
    player.setSpawnPoint({ x: 3, y: 64, z: -7, dimension: 'minecraft:overworld', forced: true });
    loadAdvancements(session.keyed(), {
        'minecraft:story/root': { criteria: { crafting_table: '2026-11-10' }, done: true }
    });
    enchantmentSeedOf(session.keyed(), 987_654);
    // The record keeps the eye position, 1.62 above the feet, as it always has.
    await session.setPlayerPosition(
        { position: new Vector3(12.5, 71.62, -8.5), pitch: 10, yaw: 20, headYaw: 30 },
        false
    );
};

/** Saves the player into a fresh level and hands back the bytes each form of the record holds. */
const writeRecord = async (fileRecords: boolean): Promise<Buffer> => {
    const server = testServer();
    const folder = path.join(scratch, fileRecords ? 'file' : 'leveldb');
    const level = buildLevel(server, folder, fileRecords);
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);
    const session = buildPlayer(world, server);
    await giveState(session);
    await world.savePlayerData(session.getPlayer());
    await level.disable();

    if (fileRecords) return fs.readFileSync(path.join(folder, 'playerdata', `${KEY}.json`));
    const database = await Database.open(path.join(folder, 'db'));
    try {
        const value = database.get(encodePlayerServerKey(KEY));
        if (value === null) throw new Error(`no record under ${KEY}`);
        return Buffer.from(value);
    } finally {
        await database.close();
    }
};

/** Puts a fixture where a save keeps it, then logs the player in from it. */
const loadRecord = async (fileRecords: boolean): Promise<PlayerSession> => {
    const server = testServer();
    const folder = path.join(scratch, fileRecords ? 'file-in' : 'leveldb-in');
    if (fileRecords) {
        fs.mkdirSync(path.join(folder, 'playerdata'), { recursive: true });
        fs.copyFileSync(JSON_FIXTURE, path.join(folder, 'playerdata', `${KEY}.json`));
    } else {
        // Opening the level once creates the database the record goes into.
        const blank = buildLevel(server, folder);
        await blank.enable();
        await blank.disable();
        const database = await Database.open(path.join(folder, 'db'));
        const batch = new WriteBatch();
        batch.put(encodePlayerServerKey(KEY), fs.readFileSync(LEVELDB_FIXTURE));
        database.write(batch);
        await database.close();
    }

    const level = buildLevel(server, folder, fileRecords);
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);
    const session = buildPlayer(world, server);
    await session.join();
    await level.disable();
    return session;
};

describe.each([
    { form: 'LevelDB value', fileRecords: false, fixture: LEVELDB_FIXTURE },
    { form: 'fallback JSON file', fileRecords: true, fixture: JSON_FIXTURE }
])('the saved player record as a $form', ({ fileRecords, fixture }) => {
    it('is written byte for byte as it was before the persistence service', async () => {
        const written = await writeRecord(fileRecords);
        if (UPDATE) {
            fs.mkdirSync(FIXTURES, { recursive: true });
            fs.writeFileSync(fixture, written);
        }

        expect(written.equals(fs.readFileSync(fixture))).toBe(true);
    });

    it('loads a record written before the persistence service', async () => {
        const session = await loadRecord(fileRecords);
        const player = session.getPlayer();
        const inventory = player.getInventory();

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_pickaxe');
        expect(inventory.getOffhand().getItem(0).getName()).toBe('minecraft:shield');
        expect(inventory.getEnderChest().getItem(5).getAmount()).toBe(9);
        expect(player.getHealth()).toBe(11);
        expect(player.getFood()).toBe(13);
        expect(player.getSaturation()).toBe(4);
        expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(27);
        expect(player.hasSeenCredits()).toBe(true);
        expect(player.getPortalCooldown()).toBe(40);
        expect(player.getSpawnPoint()).toEqual({ x: 3, y: 64, z: -7, dimension: 'minecraft:overworld', forced: true });
        expect(enchantmentSeedOf(session.keyed())).toBe(987_654);
        expect(advancementsOf(session.keyed()).toJSON(() => undefined)).toHaveProperty(['minecraft:story/root']);
        // Back at the eye position the record holds, not 1.62 below or above it.
        expect([player.getPosition().getX(), player.getPosition().getY(), player.getPosition().getZ()]).toEqual([
            12.5, 71.62, -8.5
        ]);
        expect([player.pitch, player.yaw, player.headYaw]).toEqual([10, 20, 30]);
    });
});

/** The parts of the shipped `entities/player.json` a store player needs: no `minecraft:health`. */
const SHIPPED_PLAYER = {
    components: {
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        'minecraft:type_family': { family: ['player'] }
    }
};

/** A store player built the way the store's player rules are tested, with the overlay's health. */
const buildStorePlayer = (): StorePlayer => {
    const { runtime } = entityFixture(undefined, {}, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER });
    return enteredStorePlayer({ runtime }, { uuid: IDENTITY, name: NAME, xuid: '' }).player;
};

/** What the per-player services hold for the player both fixtures describe. */
const fixtureServices = (): PlayerServiceState => ({
    advancements: PlayerAdvancements.fromJSON({
        'minecraft:story/root': { criteria: { crafting_table: '2026-11-10' }, done: true }
    }).toJSON((id) => testContent().advancements.get(id)),
    enchantmentSeed: 987_654
});

/** The player state both fixtures hold, given to a store player. */
const giveStoreState = (player: StorePlayer): void => {
    const inventory = player.getInventory();
    const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', count: 1 })
        .withEnchantments({ 'minecraft:efficiency': 4 })
        .withDisplay('Hole Maker', ['Property of the test suite']);
    pickaxe.durability = pickaxe.getMaxDurability() - 37;
    inventory.setItem(3, new ContainerEntry({ item: pickaxe, count: 1 }));
    inventory.setHandSlot(3);
    inventory.getOffhand().setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:shield' }), count: 1 }));
    inventory
        .getEnderChest()
        .setItem(5, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 9 }), count: 9 }));

    player.restoreHealth(11);
    player.setFood(13);
    player.setSaturation(4);
    player.attributes.setValue(AttributeIds.PlayerLevel, 27);
    player.setSeenCredits(true);
    player.setPortalCooldown(40);
    player.setSpawnPoint({ x: 3, y: 64, z: -7, dimension: 'minecraft:overworld', forced: true });
    // The entity stands at its feet, 70; the record keeps the eye, 1.62 above.
    player.placeAt({ x: 12.5, y: 71.62, z: -8.5, pitch: 10, yaw: 20, headYaw: 30 });
};

/**
 * Writes a store player's record into a fresh level through `World.savePlayerData`, with the
 * services holding the fixture's state under the player's key, and hands back the bytes it holds.
 */
const writeStoreRecord = async (player: StorePlayer, fileRecords: boolean, name: string): Promise<Buffer> => {
    const server = testServer();
    const folder = path.join(scratch, name);
    const level = buildLevel(server, folder, fileRecords);
    await level.enable();
    const world = await level.world(OVERWORLD_STEM_ID);
    const { advancements, enchantmentSeed } = fixtureServices();
    loadAdvancements(KEY, advancements);
    enchantmentSeedOf({ key: KEY, server }, enchantmentSeed);
    try {
        await world.savePlayerData(player);
    } finally {
        forgetAdvancements(KEY);
        forgetEnchantmentSeed(KEY);
    }
    await level.disable();

    if (fileRecords) return fs.readFileSync(path.join(folder, 'playerdata', `${KEY}.json`));
    const database = await Database.open(path.join(folder, 'db'));
    try {
        const value = database.get(encodePlayerServerKey(KEY));
        if (value === null) throw new Error(`no record under ${KEY}`);
        return Buffer.from(value);
    } finally {
        await database.close();
    }
};

/** Reads a fixture through a level, as a login does, and builds a store player from it. */
const loadStoreRecord = async (fileRecords: boolean): Promise<StorePlayer> => {
    const server = testServer();
    const folder = path.join(scratch, fileRecords ? 'store-file-in' : 'store-leveldb-in');
    if (fileRecords) {
        fs.mkdirSync(path.join(folder, 'playerdata'), { recursive: true });
        fs.copyFileSync(JSON_FIXTURE, path.join(folder, 'playerdata', `${KEY}.json`));
    } else {
        const blank = buildLevel(server, folder);
        await blank.enable();
        await blank.disable();
        const database = await Database.open(path.join(folder, 'db'));
        const batch = new WriteBatch();
        batch.put(encodePlayerServerKey(KEY), fs.readFileSync(LEVELDB_FIXTURE));
        database.write(batch);
        await database.close();
    }

    const level = buildLevel(server, folder, fileRecords);
    await level.enable();
    const data = await level.getPlayerData(KEY);
    await level.disable();
    if (data === null) throw new Error(`no record under ${KEY}`);

    const player = buildStorePlayer();
    applyPlayerRecord(player, data, 'survival', testContent());
    const position = recordedPosition(data);
    if (position !== undefined) player.placeAt(position);
    return player;
};

describe.each([
    { form: 'LevelDB value', fileRecords: false, fixture: LEVELDB_FIXTURE },
    { form: 'fallback JSON file', fileRecords: true, fixture: JSON_FIXTURE }
])('a store player record as a $form', ({ fileRecords, fixture }) => {
    it('is written byte for byte as a live player with the same state writes it', async () => {
        const player = buildStorePlayer();
        giveStoreState(player);
        const written = await writeStoreRecord(player, fileRecords, fileRecords ? 'store-file' : 'store-leveldb');

        expect(written.equals(fs.readFileSync(fixture))).toBe(true);
    });

    it('loads the record into the store entity and its parts, and saves it back unchanged', async () => {
        const player = await loadStoreRecord(fileRecords);
        const inventory = player.getInventory();

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_pickaxe');
        expect(inventory.getOffhand().getItem(0).getName()).toBe('minecraft:shield');
        expect(inventory.getEnderChest().getItem(5).getAmount()).toBe(9);
        // Health is the entity's, not the attribute table's.
        expect(player.entity?.instance.attributes.get('health')?.current).toBe(11);
        expect(player.getFood()).toBe(13);
        expect(player.getSaturation()).toBe(4);
        expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(27);
        expect(player.hasSeenCredits()).toBe(true);
        expect(player.getPortalCooldown()).toBe(40);
        expect(player.getSpawnPoint()).toEqual({ x: 3, y: 64, z: -7, dimension: 'minecraft:overworld', forced: true });
        // The entity stands at the feet, 1.62 below the eye the record holds.
        expect(player.entity?.position).toEqual({ x: 12.5, y: 70, z: -8.5 });
        expect([player.pitch, player.yaw, player.headYaw]).toEqual([10, 20, 30]);

        const again = await writeStoreRecord(player, fileRecords, fileRecords ? 'store-file-out' : 'store-leveldb-out');
        expect(again.equals(fs.readFileSync(fixture))).toBe(true);
    });
});

describe('a store player record', () => {
    // A save cut under ADR 0018 holds records until a later commit, so nothing the player does
    // after its record was taken may reach what gets written.
    it('shares nothing with the store player it was built from', () => {
        const player = buildStorePlayer();
        giveStoreState(player);
        const record = playerRecordFrom(player, fixtureServices(), Dimensions.Overworld);
        const before = structuredClone(record);

        player.getInventory().getItem(3).durability = 1;
        player.getInventory().removeItem(3);
        player.getInventory().getEnderChest().removeItem(5);
        player.setSpawnPoint({ x: 0, y: 0, z: 0, dimension: 'minecraft:the_nether' });
        player.restoreHealth(2);
        player.setFood(1);
        player.attributes.setValue(AttributeIds.PlayerLevel, 1);
        player.placeAt({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, headYaw: 0 });

        expect(record).toEqual(before);
    });
});
