import type { Logger } from '@jsprismarine/logger';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { StoreActors } from '../entity/data/storeActors';
import { StorePlayers } from '../entity/data/storePlayers';
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
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import type PlayerSession from '../network/PlayerSession';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { blockMiningOf, playerMiningOf } from './BlockMining';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';

/** A world whose dimension's entity runtime is the real one the entity fixture builds. */
const worldWithStore = () => {
    const fixture = entityFixture();
    const players = new StorePlayers();
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
        getStorePlayers: () => players,
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

/** A player of the world and its session, which sends nowhere: the change log needs only the entity. */
const playerIn = (world: World): PlayerSession =>
    sessionOnPrototype(
        { getName: () => 'Logged' },
        {
            uuid: UUID.fromString('00000000-0000-4000-8000-000000000001'),
            position: new Position(0.5, 65.62, 0.5, world)
        }
    );

const entry = (name: string, count = 1) => new ContainerEntry({ item: new Item({ name, count }) });

/** One write to every container a player carries, and to the hand slot. */
const PLAYER_SLOT_WRITES: readonly { readonly name: string; readonly write: (player: PlayerSession) => void }[] = [
    {
        name: 'inventory',
        write: (player) => player.getPlayer().getInventory().setItem(4, entry('minecraft:stone', 12))
    },
    {
        name: 'armor',
        write: (player) => player.getPlayer().getInventory().getArmor().setItem(0, entry('minecraft:iron_helmet'))
    },
    {
        name: 'offhand',
        write: (player) => player.getPlayer().getInventory().getOffhand().setItem(0, entry('minecraft:shield'))
    },
    {
        name: 'ender_chest',
        write: (player) => player.getPlayer().getInventory().getEnderChest().setItem(3, entry('minecraft:diamond', 2))
    },
    {
        name: 'cursor',
        write: (player) =>
            player
                .getPlayer()
                .getInventory()
                .setCursor(new Item({ name: 'minecraft:torch' }))
    },
    {
        name: 'crafting',
        write: (player) =>
            player
                .getPlayer()
                .getCraftingInput()
                .set(1, new Item({ name: 'minecraft:oak_log' }))
    },
    { name: 'inventory.handSlot', write: (player) => player.getPlayer().getInventory().setHandSlot(5) },
    { name: 'removal', write: (player) => player.getPlayer().getInventory().removeItem(0) }
];

/** One write to each component field of a player, with what reads it back. */
const PLAYER_COMPONENT_WRITES: readonly {
    readonly field: string;
    readonly write: (player: PlayerSession) => void | Promise<void>;
    readonly read: (player: PlayerSession) => unknown;
}[] = [
    {
        field: 'vitals.food',
        write: (player) => player.getPlayer().setFood(12),
        read: (player) => player.getPlayer().getFood()
    },
    {
        field: 'vitals.saturation',
        write: (player) => player.getPlayer().setSaturation(2),
        read: (player) => player.getPlayer().getSaturation()
    },
    {
        field: 'vitals.exhaustion',
        write: (player) => player.inputs().exhaustPlayer(player.getPlayer(), 1.5),
        read: (player) => player.getPlayer().attributes.getValue(AttributeIds.PlayerExhaustion)
    },
    {
        field: 'vitals.drowningTicks',
        write: (player) => player.getPlayer().getComponents().set('vitals.drowningTicks', 5),
        read: (player) => player.getPlayer().getComponents().get('vitals.drowningTicks')
    },
    {
        field: 'vitals.fallDistance',
        write: (player) => player.getPlayer().getComponents().set('vitals.fallDistance', 2.5),
        read: (player) => player.getPlayer().getFallDistance()
    },
    {
        field: 'experience.level',
        write: (player) => player.getPlayer().getExperience().setLevel(3),
        read: (player) => player.getPlayer().getExperience().getLevel()
    },
    {
        field: 'experience.progress',
        write: (player) => player.getPlayer().getExperience().setProgress(0.5),
        read: (player) => player.getPlayer().getExperience().getProgress()
    },
    {
        field: 'abilities.flying',
        write: (player) => {
            player.getPlayer().restoreFlying(true);
        },
        read: (player) => player.getPlayer().isFlying()
    },
    {
        field: 'movement.sneaking',
        write: (player) => player.inputs().setPlayerSneaking(player.getPlayer(), true),
        read: (player) => player.isSneaking()
    },
    {
        field: 'movement.sleeping',
        write: (player) => player.getPlayer().getComponents().set('movement.sleeping', true),
        read: (player) => player.getPlayer().isSleeping()
    },
    {
        field: 'respawn.spawnPoint',
        write: (player) =>
            player.getPlayer().setSpawnPoint({ x: 3, y: 64, z: -2, dimension: 'minecraft:overworld', forced: true }),
        read: (player) => player.getPlayer().getSpawnPoint()
    },
    {
        field: 'respawn.seenCredits',
        write: (player) => player.getPlayer().setSeenCredits(true),
        read: (player) => player.getPlayer().hasSeenCredits()
    },
    {
        field: 'itemUse.startedAt',
        write: (player) => player.getPlayer().beginItemUse(40),
        read: (player) => player.getPlayer().getComponents().get('itemUse.startedAt')
    },
    {
        field: 'vitals.air',
        write: (player) => player.getPlayer().getComponents().set('vitals.air', 120),
        read: (player) => player.getPlayer().getComponents().get('vitals.air')
    },
    {
        field: 'vitals.breathing',
        write: (player) => player.getPlayer().getComponents().set('vitals.breathing', false),
        read: (player) => player.getPlayer().getComponents().get('vitals.breathing')
    },
    {
        field: 'movement.sprinting',
        // `setSprinting` raises a plugin event, which this world's server double has no bus for.
        write: (player) => player.getPlayer().getComponents().set('movement.sprinting', true),
        read: (player) => player.getPlayer().isSprinting()
    },
    {
        field: 'mining.block',
        write: (player) =>
            player
                .inputs()
                .setPlayerMining(
                    player.getPlayer(),
                    playerMiningOf({ position: new Vector3(1, 64, 2), face: 1, runtimeId: 7, progressPerTick: 900 })
                ),
        read: (player) => blockMiningOf(player.getPlayer().getComponents().get('mining.block'))
    },
    ...(
        [
            ['attributes.absorption', AttributeIds.Absorption, 4],
            ['attributes.knockbackResistance', AttributeIds.KnockbackResistence, 0.5],
            ['attributes.movement', AttributeIds.Movement, 0.13],
            ['attributes.underwaterMovement', AttributeIds.UnderwaterMovement, 0.04],
            ['attributes.lavaMovement', AttributeIds.LavaMovement, 0.04],
            ['attributes.followRange', AttributeIds.FollowRange, 32],
            ['attributes.attackDamage', AttributeIds.AttackDamage, 3],
            ['attributes.luck', AttributeIds.Luck, 2]
        ] as const
    ).map(([field, attribute, value]) => ({
        field,
        write: (player: PlayerSession) => void player.getPlayer().setAttributeValue(attribute, value),
        read: (player: PlayerSession) => player.getPlayer().attributes.getValue(attribute)
    }))
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

    describe("a player's inventory", () => {
        const playerWithItems = async () => {
            const { world } = worldWithStore();
            const player = playerIn(world);
            await world.addPlayer(player);
            player.getPlayer().getInventory().setItem(0, entry('minecraft:bread', 3));
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

            player.getPlayer().getInventory().setItem(0, entry('minecraft:bread', 2));
            player.getPlayer().getInventory().getArmor().setItem(3, entry('minecraft:iron_boots'));
            player.getPlayer().getInventory().setHandSlot(2);
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

            player.getPlayer().getInventory().setItem(0, entry('minecraft:bread', 3));
            player.getPlayer().getInventory().setHandSlot(0);
            player.getPlayer().getCraftingInput().clear();
            world.sealChangeTick();

            expect(world.lastChangeTick()?.entries).toEqual([]);
        });
    });

    describe("a player's components", () => {
        const survivalPlayer = async () => {
            const { world } = worldWithStore();
            const player = playerIn(world);
            player.getPlayer().gamemode = Gametype.SURVIVAL;
            await world.addPlayer(player);
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

            player.getPlayer().setFood(40);
            player.getPlayer().setFood(25);
            world.sealChangeTick();

            // Food is already full, and its attribute keeps it at 20, so neither write changed it.
            expect(world.lastChangeTick()?.entries).toEqual([]);
        });
    });
});

describe("a world's blocks and block entities in its change log", () => {
    /** A world with the chunk at the origin loaded, and the runtime ids of a few blocks. */
    const worldWithChunk = async () => {
        const made = worldWithStore();
        await made.world.loadChunk(0, 0);
        const id = (name: string) => {
            const runtimeId = BlockRuntimeIds.tryGetByName(name);
            if (runtimeId === null) throw new Error(`the test content has no ${name}`);
            return runtimeId;
        };
        return { ...made, air: id('minecraft:air'), stone: id('minecraft:stone'), dirt: id('minecraft:dirt') };
    };

    /** A chest's tags at a position, holding the given stacks by slot. */
    const chestTags = (at: { x: number; y: number; z: number }, stacks: Record<number, [string, number]>) => {
        const tags = new NBTTagCompound('');
        tags.addValue('id', new Types.StringVal('Chest'));
        tags.addValue('x', new Types.NumberVal(at.x));
        tags.addValue('y', new Types.NumberVal(at.y));
        tags.addValue('z', new Types.NumberVal(at.z));
        const items = new Set<NBTTagCompound>();
        for (const [slot, [name, count]] of Object.entries(stacks)) {
            const stack = new NBTTagCompound('');
            stack.addValue('Name', new Types.StringVal(name));
            stack.addValue('Count', new Types.ByteVal(count));
            stack.addValue('Slot', new Types.ByteVal(Number(slot)));
            items.add(stack);
        }
        tags.addValue('Items', items);
        return tags;
    };

    const blockEntries = (world: World) =>
        (world.lastChangeTick()?.entries ?? []).filter(
            (entry) => entry.kind === 'field' && (entry.field === 'block' || entry.field === 'block-entity')
        );

    it('appends exactly one entry for each block write, with the block before it', async () => {
        const { world, air, stone, dirt } = await worldWithChunk();
        world.beginChangeTick();

        world.setLoadedBlockRuntimeId(1, 64, 1, stone);
        world.setLoadedBlockRuntimeId(2, 64, 1, stone);
        world.setLoadedBlockRuntimeId(1, 64, 1, dirt);
        // Writing what already stands there changes nothing, so it is not a write.
        world.setLoadedBlockRuntimeId(2, 64, 1, stone);
        world.sealChangeTick();

        expect(blockEntries(world)).toEqual([
            { kind: 'field', field: 'block', address: { x: 1, y: 64, z: 1, layer: 0 }, before: air, after: stone },
            { kind: 'field', field: 'block', address: { x: 2, y: 64, z: 1, layer: 0 }, before: air, after: stone },
            { kind: 'field', field: 'block', address: { x: 1, y: 64, z: 1, layer: 0 }, before: stone, after: dirt }
        ]);
    });

    it.each([1, 16, 100])('appends %i entries for as many block writes', async (count) => {
        const { world, stone } = await worldWithChunk();
        world.beginChangeTick();

        for (let index = 0; index < count; index++)
            world.setLoadedBlockRuntimeId(index % 16, 64 + (index >> 4), 3, stone);
        world.sealChangeTick();

        expect(blockEntries(world)).toHaveLength(count);
    });

    it('counts a block write between ticks as unlogged', async () => {
        const { world, stone } = await worldWithChunk();
        const before = world.getEntityStore().counts().unlogged;

        world.setLoadedBlockRuntimeId(1, 64, 1, stone);

        expect(world.getEntityStore().counts().unlogged).toBe(before + 1);
    });

    it('undoes a unit that wrote blocks, leaving the replay digest as it was', async () => {
        const { world, stone, dirt } = await worldWithChunk();
        world.setLoadedBlockRuntimeId(1, 64, 1, stone);
        const digest = world.replayStateDigest();
        world.beginChangeTick();

        const outcome = world.getEntityStore().unit(() => {
            world.setLoadedBlockRuntimeId(1, 64, 1, dirt);
            world.setLoadedBlockRuntimeId(1, 65, 1, stone);
            throw new Error('planned');
        });
        world.sealChangeTick();

        expect(outcome.failed).toBe(true);
        expect(world.lastChangeTick()?.entries).toEqual([]);
        expect(world.loadedBlockAt(1, 64, 1)?.name).toBe('minecraft:stone');
        expect(world.loadedBlockAt(1, 65, 1)?.name).toBe('minecraft:air');
        expect(world.replayStateDigest()).toBe(digest);
    });

    it('logs a block entity as its data and one field for each slot, by block position', async () => {
        const { world } = await worldWithChunk();
        world.beginChangeTick();

        writeBlockEntity(
            world,
            chestTags({ x: 4, y: 64, z: 4 }, { 0: ['minecraft:bread', 3], 5: ['minecraft:stone', 1] })
        );
        world.sealChangeTick();

        expect(blockEntries(world).map((entry) => entry.kind === 'field' && entry.address)).toEqual([
            { x: 4, y: 64, z: 4, field: 'data' },
            { x: 4, y: 64, z: 4, field: 'items.0' },
            { x: 4, y: 64, z: 4, field: 'items.5' }
        ]);
    });

    it('logs one entry for a stack moved into a chest', async () => {
        const { world } = await worldWithChunk();
        const at = { x: 4, y: 64, z: 4 };
        writeBlockEntity(world, chestTags(at, { 0: ['minecraft:bread', 3] }));
        world.beginChangeTick();

        writeBlockEntity(world, chestTags(at, { 0: ['minecraft:bread', 3], 7: ['minecraft:torch', 4] }));
        world.sealChangeTick();

        expect(blockEntries(world)).toEqual([
            expect.objectContaining({ field: 'block-entity', address: { ...at, field: 'items.7' }, before: null })
        ]);
    });

    it('undoes a unit that changed and then removed a block entity, leaving the replay digest as it was', async () => {
        const { world, stone } = await worldWithChunk();
        const at = { x: 4, y: 64, z: 4 };
        world.setLoadedBlockRuntimeId(at.x, at.y, at.z, stone);
        writeBlockEntity(world, chestTags(at, { 0: ['minecraft:bread', 3], 2: ['minecraft:torch', 4] }));
        writeBlockEntity(world, chestTags({ x: 5, y: 64, z: 4 }, { 1: ['minecraft:dirt', 9] }));
        const digest = world.replayStateDigest();
        world.beginChangeTick();

        const outcome = world.getEntityStore().unit(() => {
            writeBlockEntity(world, chestTags(at, { 0: ['minecraft:bread', 2], 9: ['minecraft:stone', 1] }));
            // A block write clears the block entity standing there.
            world.setLoadedBlockRuntimeId(at.x, at.y, at.z, BlockRuntimeIds.getByName('minecraft:air'));
            throw new Error('planned');
        });
        world.sealChangeTick();

        expect(outcome.failed).toBe(true);
        expect(world.lastChangeTick()?.entries).toEqual([]);
        expect(world.getLoadedChunk(0, 0)?.getBlockEntity(at.x, at.y, at.z)?.getId()).toBe('Chest');
        expect(world.replayStateDigest()).toBe(digest);
    });

    it('undoes a unit that placed a block entity, leaving the replay digest as it was', async () => {
        const { world, stone } = await worldWithChunk();
        const at = { x: 4, y: 64, z: 4 };
        const digest = world.replayStateDigest();
        world.beginChangeTick();

        const outcome = world.getEntityStore().unit(() => {
            world.setLoadedBlockRuntimeId(at.x, at.y, at.z, stone);
            writeBlockEntity(world, chestTags(at, { 3: ['minecraft:bread', 1] }));
            throw new Error('planned');
        });
        world.sealChangeTick();

        expect(outcome.failed).toBe(true);
        expect(world.getLoadedChunk(0, 0)?.getBlockEntity(at.x, at.y, at.z)).toBeNull();
        expect(world.replayStateDigest()).toBe(digest);
    });
});
