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
import { stub, stubOf } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import type { Generator } from './Generator';
import BaseProvider from './providers/BaseProvider';
import { World } from './World';
import { Position } from './Position';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import type PlayerSession from '../network/PlayerSession';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { blockMiningOf, playerMiningOf } from './BlockMining';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import { worldBlockStorage } from './contentAdapter';
import { createEngineWorld } from './EngineWorld';
import { chestTags } from '../testing/sealedBlocks.test.helper';
import { beginMeasuredChangeTick } from '../testing/changeTicks.test.helper';
import { inverseOf } from './changelog/ChangeEntry';

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
    const provider = stubOf(BaseProvider, {
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

/**
 * Every slot of a player's containers and the hand, as names and counts. The fixture's digest
 * hashes no actors, so a test that undoes a slot write compares this as well.
 */
const slotsOf = (player: PlayerSession) => {
    const inventory = player.getPlayer().getInventory();
    const stacks = (items: readonly (Item | null)[]) => items.map((item) => item && [item.getName(), item.count]);
    const crafting = player.getPlayer().getCraftingInput();
    return {
        inventory: stacks(inventory.getItems(true).map((each) => each.getItem())),
        armor: stacks(
            inventory
                .getArmor()
                .getItems(true)
                .map((each) => each.getItem())
        ),
        offhand: stacks(
            inventory
                .getOffhand()
                .getItems(true)
                .map((each) => each.getItem())
        ),
        enderChest: stacks(
            inventory
                .getEnderChest()
                .getItems(true)
                .map((each) => each.getItem())
        ),
        cursor: stacks([inventory.getCursor()]),
        crafting: stacks(Array.from({ length: 9 }, (_, slot) => crafting.get(slot))),
        hand: inventory.getHandSlotIndex()
    };
};

/** One write to each component field of a player, with what reads it back. */
const PLAYER_COMPONENT_WRITES: readonly {
    readonly field: string;
    readonly write: (player: PlayerSession) => void;
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
            player.inputs().setPlayerMining(
                player.getPlayer(),
                playerMiningOf({
                    position: new Vector3(1, 64, 2),
                    face: 1,
                    runtimeId: 7,
                    progressPerTick: 900,
                    breakTicks: 73,
                    startedAt: 0
                })
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
        beginMeasuredChangeTick(world);
        world.runInputNow(() => {
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

        beginMeasuredChangeTick(world);
        expect(() =>
            world.runInputNow(() => {
                cow.instance.attributes.set('health', 1);
                throw new Error('the handler failed');
            })
        ).toThrow('the handler failed');

        expect(runtime.savedFormOf(cow)).toEqual(before);
        world.sealChangeTick();
        expect(world.lastChangeTick()?.entries).toEqual([]);
    });

    it('undoes a synchronous input that throws, and keeps the writes of one that returns', () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        const before = runtime.savedFormOf(cow);

        beginMeasuredChangeTick(world);
        expect(() =>
            world.runInputNow(() => {
                cow.instance.attributes.set('health', 1);
                throw new Error('the handler failed');
            })
        ).toThrow('the handler failed');
        expect(runtime.savedFormOf(cow)).toEqual(before);

        world.runInputNow(() => {
            cow.body.nameTag = 'Daisy';
        });
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toEqual([
            {
                kind: 'field',
                field: 'entity',
                address: { entity: BigInt(cow.id), field: 'nameTag' },
                before: null,
                after: 'Daisy'
            }
        ]);
    });

    it('names a chunk that enters the world in the tick that admitted it', async () => {
        const { world } = worldWithStore();
        beginMeasuredChangeTick(world);
        await world.loadChunk(2, 3);
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toContainEqual({ kind: 'chunk', change: 'enter', x: 2, z: 3 });
    });

    it('takes a chunk out for a chunk leave replayed from the log, which needs only its position', async () => {
        const { world } = worldWithStore();
        await world.loadChunk(2, 3);

        expect(world.replayChunkLeave(2, 3)).toBe(true);
        expect(world.getLoadedChunk(2, 3)).toBeNull();
        expect(world.replayChunkLeave(2, 3)).toBe(false);
    });

    it('stops ticking once its store could not undo a unit, and says so once', async () => {
        const { world, runtime, errors } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        cow.body.loveTicks = 100;
        beginMeasuredChangeTick(world);
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

    it('applies no input once its store could not undo a unit', () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        beginMeasuredChangeTick(world);
        runtime.store.unit(() => {
            runtime.store.written(cow, 'not-a-field', 1, 2);
            throw new Error('planned');
        });
        expect(runtime.store.broken).toBeInstanceOf(Error);

        let applied = 0;
        world.runInputNow(() => {
            applied += 1;
            cow.body.loveTicks = 600;
        });

        expect(applied).toBe(0);
        expect(cow.body.loveTicks).toBe(0);
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
            async ({ name, write }) => {
                const { world, player } = await playerWithItems();
                const before = world.replayStateDigest();
                const slots = slotsOf(player);
                beginMeasuredChangeTick(world);

                const outcome = world.getEntityStore().unit(() => {
                    write(player);
                    throw new Error('planned');
                });
                world.sealChangeTick();

                expect(outcome.failed).toBe(true);
                // The write leaves the log. A slot written back holds a stack with a new network
                // id, so the log says to show the owner that slot again, and that is all it holds.
                const left = world.lastChangeTick()?.entries ?? [];
                expect(left.every((each) => each.kind === 'occurrence' && each.occurrence === 'slot-shown')).toBe(true);
                // The hand slot is a field of the player and not a slot, so nothing is shown again.
                expect(left).toHaveLength(name === 'inventory.handSlot' ? 0 : 1);
                expect(slotsOf(player)).toEqual(slots);
                expect(world.replayStateDigest()).toBe(before);

                // The same write in a unit that finishes is one entry, and changes a slot.
                beginMeasuredChangeTick(world);
                write(player);
                world.sealChangeTick();
                expect(world.lastChangeTick()?.entries).toHaveLength(1);
                expect(slotsOf(player)).not.toEqual(slots);
            }
        );

        it('logs one entry per slot written, with the value before it', async () => {
            const { world, player } = await playerWithItems();
            const id = player.getRuntimeId();
            beginMeasuredChangeTick(world);

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
            beginMeasuredChangeTick(world);

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
                beginMeasuredChangeTick(world);

                const outcome = world.getEntityStore().unit(() => {
                    write(player);
                    throw new Error('planned');
                });
                world.sealChangeTick();

                expect(outcome.failed).toBe(true);
                expect(world.lastChangeTick()?.entries).toEqual([]);
                expect(read(player)).toEqual(before);
                expect(world.replayStateDigest()).toBe(digest);

                beginMeasuredChangeTick(world);
                write(player);
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
            beginMeasuredChangeTick(world);

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

    /** Runs an empty tick, which logs the setup's writes between ticks so the tick under test holds only its own. */
    const settle = (world: World) => {
        beginMeasuredChangeTick(world);
        world.sealChangeTick();
    };

    const blockEntries = (world: World) =>
        (world.lastChangeTick()?.entries ?? []).filter(
            (entry) => entry.kind === 'field' && (entry.field === 'block' || entry.field === 'block-entity')
        );

    it('appends exactly one entry for each block write, with the block before it', async () => {
        const { world, air, stone, dirt } = await worldWithChunk();
        beginMeasuredChangeTick(world);

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
        beginMeasuredChangeTick(world);

        for (let index = 0; index < count; index++)
            world.setLoadedBlockRuntimeId(index % 16, 64 + (index >> 4), 3, stone);
        world.sealChangeTick();

        expect(blockEntries(world)).toHaveLength(count);
    });

    it('logs a block write between ticks at the start of the next tick, ahead of its own writes', async () => {
        const { world, stone, dirt } = await worldWithChunk();
        const before = world.getEntityStore().counts().unlogged;

        world.setLoadedBlockRuntimeId(1, 64, 1, stone);
        world.beginChangeTick();
        world.setLoadedBlockRuntimeId(2, 64, 2, dirt);
        world.sealChangeTick();

        expect(world.getEntityStore().counts().unlogged).toBe(before);
        expect(blockEntries(world)).toEqual([
            expect.objectContaining({ address: { x: 1, y: 64, z: 1, layer: 0 }, after: stone }),
            expect.objectContaining({ address: { x: 2, y: 64, z: 2, layer: 0 }, after: dirt })
        ]);
    });

    it('undoes a unit that wrote blocks, leaving the replay digest as it was', async () => {
        const { world, stone, dirt } = await worldWithChunk();
        world.setLoadedBlockRuntimeId(1, 64, 1, stone);
        settle(world);
        const digest = world.replayStateDigest();
        beginMeasuredChangeTick(world);

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

    it('logs the block updates and scheduled ticks a unit queued, and undoes them with it', async () => {
        const { world, stone } = await worldWithChunk();
        const fluids = world.getSystems().ticks.list('fluid');
        fluids.schedule({ x: 3, y: 64, z: 3 }, 'minecraft:water', 50);
        settle(world);
        const digest = world.replayStateDigest();
        beginMeasuredChangeTick(world);

        const kept = world.getEntityStore().unit(() => {
            world.setLoadedBlockRuntimeId(4, 64, 4, stone);
            fluids.schedule({ x: 4, y: 65, z: 4 }, 'minecraft:water', 5);
        });
        expect(kept.failed).toBe(false);
        const undone = world.getEntityStore().unit(() => {
            world.setLoadedBlockRuntimeId(5, 64, 5, stone);
            fluids.schedule({ x: 5, y: 65, z: 5 }, 'minecraft:water', 5);
            fluids.clearAt({ x: 3, y: 64, z: 3 });
            throw new Error('planned');
        });
        world.sealChangeTick();

        expect(undone.failed).toBe(true);
        // The kept unit's write, the seven updates it queued around itself and its fluid tick.
        expect(
            world.lastChangeTick()?.entries.map((entry) => (entry.kind === 'field' ? entry.field : entry.kind))
        ).toEqual(['block', ...Array<string>(7).fill('block-update'), 'scheduled-tick']);
        expect(fluids.hasScheduledTick({ x: 3, y: 64, z: 3 }, 'minecraft:water')).toBe(true);
        expect(fluids.hasScheduledTick({ x: 5, y: 65, z: 5 }, 'minecraft:water')).toBe(false);
        expect(
            world
                .getBlockUpdates()
                .snapshot()
                .some(({ position: { x, z } }) => x === 5 && z === 5)
        ).toBe(false);

        // Undoing the kept unit's entries too, newest first, returns the digest to where it was.
        const entries = [...(world.lastChangeTick()?.entries ?? [])].reverse();
        world.getEntityStore().replay(entries.flatMap((entry) => (entry.kind === 'field' ? [inverseOf(entry)] : [])));
        expect(world.replayStateDigest()).toBe(digest);
    });

    it('seals each tick with the clocks and in-flight work no entry carries, which the digest hashes', async () => {
        const { world, stone } = await worldWithChunk();
        beginMeasuredChangeTick(world);
        world.setLoadedBlockRuntimeId(1, 64, 1, stone);
        const sealed = world.sealChangeTick();

        expect(sealed?.header).toEqual(world.tickHeader());
        expect(structuredClone(sealed)).toEqual(sealed);
        expect(world.replayStateDigest(sealed?.header)).toBe(world.replayStateDigest());
        expect(world.replayStateDigest({ ...world.tickHeader(), randomTickState: 7 })).not.toBe(
            world.replayStateDigest()
        );
    });

    it("reaches another world's digest from the same start and that world's sealed tick", async () => {
        const live = await worldWithChunk();
        const copy = await worldWithChunk();
        const fluids = live.world.getSystems().ticks.list('fluid');
        settle(live.world);
        settle(copy.world);
        expect(copy.world.replayStateDigest()).toBe(live.world.replayStateDigest());

        beginMeasuredChangeTick(live.world);
        live.world.setLoadedBlockRuntimeId(1, 64, 1, live.stone);
        fluids.schedule({ x: 1, y: 65, z: 1 }, 'minecraft:water', 3);
        fluids.schedule({ x: 2, y: 65, z: 1 }, 'minecraft:water', 1);
        fluids.tick(1, () => {});
        live.world.getBlockUpdates().due(live.world.getTicks() + 1);
        live.world.setLoadedBlockRuntimeId(1, 64, 1, live.dirt);
        const sealed = live.world.sealChangeTick();
        if (sealed === undefined) throw new Error('no tick was open');

        expect(new Set(sealed.entries.map((entry) => (entry.kind === 'field' ? entry.field : entry.kind)))).toEqual(
            new Set(['block', 'block-update', 'scheduled-tick'])
        );
        expect(copy.world.replayStateDigest(sealed.header)).not.toBe(live.world.replayStateDigest());
        copy.world.getEntityStore().replay(sealed.entries);
        expect(copy.world.replayStateDigest(sealed.header)).toBe(live.world.replayStateDigest());
    });

    it('logs a block entity as its data and one field for each slot, by block position', async () => {
        const { world } = await worldWithChunk();
        beginMeasuredChangeTick(world);

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
        settle(world);
        beginMeasuredChangeTick(world);

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
        settle(world);
        const digest = world.replayStateDigest();
        beginMeasuredChangeTick(world);

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
        beginMeasuredChangeTick(world);

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

    it('logs what the engine systems write, which fluids, fire, redstone and blasts write through', async () => {
        const { world, air } = await worldWithChunk();
        beginMeasuredChangeTick(world);

        createEngineWorld(world).setBlock({ x: 6, y: 64, z: 6 }, { name: 'minecraft:stone', states: {} }, true);
        world.sealChangeTick();

        expect(blockEntries(world)).toEqual([
            expect.objectContaining({ field: 'block', address: { x: 6, y: 64, z: 6, layer: 0 }, before: air })
        ]);
    });

    it('logs a pushed chest as leaving one position and arriving at the next, and undoes the push', async () => {
        const { world, stone, air } = await worldWithChunk();
        const from = { x: 7, y: 64, z: 7 };
        const to = { x: 8, y: 64, z: 7 };
        world.setLoadedBlockRuntimeId(from.x, from.y, from.z, stone);
        writeBlockEntity(world, chestTags(from, { 0: ['minecraft:bread', 3] }));
        settle(world);
        beginMeasuredChangeTick(world);

        // The write a piston's push makes, through the block storage the block behaviors write through.
        const { move } = worldBlockStorage(() => world);
        if (move === undefined) throw new Error('the world block storage moves no blocks');
        move(from, to);
        const digest = world.replayStateDigest();
        const pushed = world.getEntityStore().unit(() => {
            move(to, { x: 9, y: 64, z: 7 });
            throw new Error('planned');
        });
        world.sealChangeTick();

        expect(pushed.failed).toBe(true);
        expect(
            blockEntries(world).map((entry) =>
                entry.field === 'block'
                    ? `block ${entry.address.x}: ${entry.before} -> ${entry.after}`
                    : `${entry.address.field} ${entry.address.x}: ${entry.before === null ? 'none' : 'some'} -> ${entry.after === null ? 'none' : 'some'}`
            )
        ).toEqual([
            'items.0 7: some -> none',
            'data 7: some -> none',
            `block 7: ${stone} -> ${air}`,
            `block 8: ${air} -> ${stone}`,
            'data 8: none -> some',
            'items.0 8: none -> some'
        ]);
        // Undoing the second push leaves the chest where the first one put it.
        expect(world.getLoadedChunk(0, 0)?.getBlockEntity(to.x, to.y, to.z)?.getId()).toBe('Chest');
        expect(world.loadedBlockAt(9, 64, 7)?.name).toBe('minecraft:air');
        expect(world.replayStateDigest()).toBe(digest);
    });
});
