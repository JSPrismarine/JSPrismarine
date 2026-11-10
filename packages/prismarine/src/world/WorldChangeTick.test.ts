import type { Logger } from '@jsprismarine/logger';
import { InetAddress } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { Gametype } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { StoreActors } from '../entity/data/storeActors';
import type { LiveEntityRuntime } from '../entity/data/live';
import type Server from '../Server';
import { testContent } from '../testing/entityServer';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import { World } from './World';
import { Position } from './Position';
import { GenericEntity } from '../entity/GenericEntity';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import Player from '../Player';

/** A world whose dimension's entity runtime is the real one the entity fixture builds. */
const worldWithStore = () => {
    const fixture = entityFixture();
    const errors: unknown[] = [];
    const live = stub<LiveEntityRuntime>({
        runtime: fixture.runtime,
        actors: stub<StoreActors>({ all: () => [][Symbol.iterator](), actorOf: () => undefined }),
        tick: async (tick) => fixture.runtime.tick(tick),
        persist: () => {},
        savedRecords: () => new Map(),
        onEntityRemoved: () => () => false,
        isInRide: () => false,
        restoreExisting: () => undefined
    });
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: (...message) => void errors.push(message[0]),
        debug: () => {},
        verbose: () => {}
    });
    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => live,
        hasEntityRuntime: () => true
    });
    const provider = stub<BaseProvider>({
        readChunk: async (_dimension, x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
    });
    const world = new World({
        name: 'world-change-tick-test',
        path: 'world-change-tick-test',
        server,
        level: fakeLevel({ server, provider }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });
    return { world, runtime: fixture.runtime, errors };
};

/** A player of the world, with no session: the change log needs only the entity. */
const playerIn = (world: World): Player =>
    new Player({
        position: new Position(0.5, 65.62, 0.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid: UUID.fromString('00000000-0000-4000-8000-000000000001'),
            name: 'Logged',
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });

const entry = (name: string, count = 1) => new ContainerEntry({ item: new Item({ name, count }) });

/** One write to every container a player carries, and to the hand slot. */
const PLAYER_SLOT_WRITES: readonly { readonly name: string; readonly write: (player: Player) => void }[] = [
    { name: 'inventory', write: (player) => player.getInventory().setItem(4, entry('minecraft:stone', 12)) },
    { name: 'armor', write: (player) => player.getInventory().getArmor().setItem(0, entry('minecraft:iron_helmet')) },
    { name: 'offhand', write: (player) => player.getInventory().getOffhand().setItem(0, entry('minecraft:shield')) },
    {
        name: 'ender_chest',
        write: (player) => player.getInventory().getEnderChest().setItem(3, entry('minecraft:diamond', 2))
    },
    { name: 'cursor', write: (player) => player.getInventory().setCursor(new Item({ name: 'minecraft:torch' })) },
    { name: 'crafting', write: (player) => player.getCraftingInput().set(1, new Item({ name: 'minecraft:oak_log' })) },
    { name: 'inventory.handSlot', write: (player) => player.getInventory().setHandSlot(5) },
    { name: 'removal', write: (player) => player.getInventory().removeItem(0) }
];

/** One write to each component field of a player, with what reads it back. */
const PLAYER_COMPONENT_WRITES: readonly {
    readonly field: string;
    readonly write: (player: Player) => void | Promise<void>;
    readonly read: (player: Player) => unknown;
}[] = [
    { field: 'vitals.food', write: (player) => player.setFood(12), read: (player) => player.getFood() },
    {
        field: 'vitals.saturation',
        write: (player) => player.setSaturation(2),
        read: (player) => player.getSaturation()
    },
    {
        field: 'vitals.exhaustion',
        write: (player) => player.addExhaustion(1.5),
        read: (player) => player.attributes.getValue(AttributeIds.PlayerExhaustion)
    },
    {
        field: 'vitals.drowningTicks',
        write: (player) => {
            player['drowningTicks'] = 5;
        },
        read: (player) => player['drowningTicks']
    },
    {
        field: 'vitals.fallDistance',
        write: (player) => {
            player['fallDistance'] = 2.5;
        },
        read: (player) => player.getFallDistance()
    },
    {
        field: 'experience.level',
        write: (player) => player.getExperience().setLevel(3),
        read: (player) => player.getExperience().getLevel()
    },
    {
        field: 'experience.progress',
        write: (player) => player.getExperience().setProgress(0.5),
        read: (player) => player.getExperience().getProgress()
    },
    {
        field: 'abilities.flying',
        write: (player) => {
            player['flying'] = true;
        },
        read: (player) => player.isFlying()
    },
    { field: 'movement.sneaking', write: (player) => player.setSneaking(true), read: (player) => player.isSneaking() },
    { field: 'movement.sleeping', write: (player) => player.setSleeping(true), read: (player) => player.isSleeping() },
    { field: 'movement.onGround', write: (player) => player.setOnGround(true), read: (player) => player.isOnGround() },
    {
        field: 'respawn.spawnPoint',
        write: (player) => player.setSpawnPoint({ x: 3, y: 64, z: -2, dimension: 'minecraft:overworld', forced: true }),
        read: (player) => player.getSpawnPoint()
    },
    {
        field: 'respawn.seenCredits',
        write: (player) => player.setSeenCredits(true),
        read: (player) => player.hasSeenCredits()
    },
    {
        field: 'itemUse.startedAt',
        write: (player) => player.beginItemUse(40),
        read: (player) => player['itemUseStartedAt']
    }
];

describe('a world tick and its change log', () => {
    it('logs an input applied at the input step in the tick it belongs to', async () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');

        // What the ticker does: open the tick, apply the inputs, then update the world.
        world.beginChangeTick();
        await world.runInput(async () => {
            cow.body.nameTag = 'Daisy';
        });
        expect(world.lastChangeTick()).toBeUndefined();
        // The close phase; a full update needs a server this double does not stand in for.
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toContainEqual({
            kind: 'field',
            field: 'entity',
            address: { entity: BigInt(cow.id), field: 'nameTag' },
            before: null,
            after: 'Daisy'
        });
    });

    it('undoes an input that throws and passes the error on', async () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        const before = runtime.savedFormOf(cow);

        world.beginChangeTick();
        await expect(
            world.runInput(async () => {
                cow.instance.attributes.set('health', 1);
                throw new Error('the handler failed');
            })
        ).rejects.toThrow('the handler failed');

        expect(runtime.savedFormOf(cow)).toEqual(before);
        world.sealChangeTick();
        expect(world.lastChangeTick()?.entries).toEqual([]);
    });

    it('names a chunk that enters the world in the tick that admitted it', async () => {
        const { world } = worldWithStore();
        world.beginChangeTick();
        await world.loadChunk(2, 3);
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toContainEqual({ kind: 'chunk', change: 'enter', x: 2, z: 3 });
    });

    it('stops ticking once its store could not undo a unit, and says so once', async () => {
        const { world, runtime, errors } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        cow.body.loveTicks = 100;
        world.beginChangeTick();
        runtime.store.unit(() => {
            runtime.store.written(cow, 'not-a-field', 1, 2);
            throw new Error('planned');
        });
        runtime.store.sealTick();

        await world.update(1);
        await world.update(2);

        expect(cow.body.loveTicks).toBe(100);
        expect(errors.filter((line) => String(line).includes('stopped ticking'))).toHaveLength(1);
    });

    it("logs a legacy entity's position and health through the adapter, and undoes them", async () => {
        const { world } = worldWithStore();
        const body = new GenericEntity({
            identifier: 'minecraft:armor_stand',
            position: new Position(1, 64, 1, world)
        });
        await world.addEntity(body);
        const health = body.getHealth();
        const store = world.getEntityStore();
        world.beginChangeTick();

        const outcome = await store.unitAsync(async () => {
            body.restorePosition(new Position(4, 64, 2, world));
            await body.setHealth(health - 1);
            throw new Error('planned');
        });

        expect(outcome.failed).toBe(true);
        expect([body.getPosition().getX(), body.getPosition().getZ(), body.getHealth()]).toEqual([1, 1, health]);

        body.restorePosition(new Position(4, 64, 2, world));
        await body.setHealth(health - 1);
        world.sealChangeTick();
        const id = body.getRuntimeId();
        expect(world.lastChangeTick()?.entries).toEqual([
            {
                kind: 'field',
                field: 'entity',
                address: { entity: id, field: 'position' },
                before: { x: 1, y: 64, z: 1 },
                after: { x: 4, y: 64, z: 2 }
            },
            {
                kind: 'field',
                field: 'entity',
                address: { entity: id, field: 'health' },
                before: health,
                after: health - 1
            }
        ]);
    });

    describe("a player's inventory", () => {
        const playerWithItems = async () => {
            const { world } = worldWithStore();
            const player = playerIn(world);
            await world.addEntity(player);
            player.getInventory().setItem(0, entry('minecraft:bread', 3));
            return { world, player };
        };

        it.each(PLAYER_SLOT_WRITES)(
            'undoes a write to the $name, leaving the replay digest as it was',
            async ({ write }) => {
                const { world, player } = await playerWithItems();
                const before = world.replayStateDigest();
                world.beginChangeTick();

                const outcome = await world.getEntityStore().unitAsync(async () => {
                    write(player);
                    throw new Error('planned');
                });
                world.sealChangeTick();

                expect(outcome.failed).toBe(true);
                expect(world.lastChangeTick()?.entries).toEqual([]);
                expect(world.replayStateDigest()).toBe(before);

                // The same write in a unit that finishes is one entry.
                world.beginChangeTick();
                write(player);
                world.sealChangeTick();
                expect(world.lastChangeTick()?.entries).toHaveLength(1);
            }
        );

        it('logs one entry per slot written, with the value before it', async () => {
            const { world, player } = await playerWithItems();
            const id = player.getRuntimeId();
            world.beginChangeTick();

            player.getInventory().setItem(0, entry('minecraft:bread', 2));
            player.getInventory().getArmor().setItem(3, entry('minecraft:iron_boots'));
            player.getInventory().setHandSlot(2);
            world.sealChangeTick();

            expect(world.lastChangeTick()?.entries).toEqual([
                {
                    kind: 'field',
                    field: 'inventory-slot',
                    address: { entity: id, container: 'inventory', slot: 0 },
                    before: { name: 'minecraft:bread', count: 3 },
                    after: { name: 'minecraft:bread', count: 2 }
                },
                {
                    kind: 'field',
                    field: 'inventory-slot',
                    address: { entity: id, container: 'armor', slot: 3 },
                    before: null,
                    after: { name: 'minecraft:iron_boots', count: 1 }
                },
                {
                    kind: 'field',
                    field: 'entity',
                    address: { entity: id, field: 'inventory.handSlot' },
                    before: 0,
                    after: 2
                }
            ]);
        });

        it('logs nothing for a write that leaves a slot as it was', async () => {
            const { world, player } = await playerWithItems();
            world.beginChangeTick();

            player.getInventory().setItem(0, entry('minecraft:bread', 3));
            player.getInventory().setHandSlot(0);
            player.getCraftingInput().clear();
            world.sealChangeTick();

            expect(world.lastChangeTick()?.entries).toEqual([]);
        });
    });

    describe("a player's components", () => {
        const survivalPlayer = async () => {
            const { world } = worldWithStore();
            const player = playerIn(world);
            player.gamemode = Gametype.SURVIVAL;
            await world.addEntity(player);
            return { world, player };
        };

        it.each(PLAYER_COMPONENT_WRITES)(
            'logs a write to $field once, and undoes it to the same digest',
            async ({ field, write, read }) => {
                const { world, player } = await survivalPlayer();
                const before = read(player);
                const digest = world.replayStateDigest();
                world.beginChangeTick();

                const outcome = await world.getEntityStore().unitAsync(async () => {
                    await write(player);
                    throw new Error('planned');
                });
                world.sealChangeTick();

                expect(outcome.failed).toBe(true);
                expect(world.lastChangeTick()?.entries).toEqual([]);
                expect(read(player)).toEqual(before);
                expect(world.replayStateDigest()).toBe(digest);

                world.beginChangeTick();
                await write(player);
                world.sealChangeTick();
                expect(world.lastChangeTick()?.entries).toEqual([
                    expect.objectContaining({
                        kind: 'field',
                        field: 'entity',
                        address: { entity: player.getRuntimeId(), field }
                    })
                ]);
            }
        );

        it('logs the value an attribute took, not the one asked for', async () => {
            const { world, player } = await survivalPlayer();
            world.beginChangeTick();

            player.setFood(40);
            player.setFood(25);
            world.sealChangeTick();

            // Food is already full, and its attribute keeps it at 20, so neither write changed it.
            expect(world.lastChangeTick()?.entries).toEqual([]);
        });
    });
});
