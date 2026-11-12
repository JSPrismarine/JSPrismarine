import { Gametype, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import { ItemActor as ItemEntity } from '../entity/data/itemActor';
import type { LiveEntityRuntime } from '../entity/data/live';
import { Item } from '../item/Item';
import { NetworkWorldReplicator } from '../network/NetworkWorldReplicator';
import AddItemActorPacket from '@jsprismarine/protocol/packet/AddItemActorPacket';
import Codec2193 from '../network/codec/Codec2193';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { liveTestEntities } from '../testing/entityServer';
import { Dimensions } from './Dimension';
import Chunk from './chunk/Chunk';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { fakeLevel } from '../testing/level';
import { replicateEntities } from '../testing/changeTicks.test.helper';
import { QUIET_TICK_HEADER } from '../testing/tickHeader.test.helper';

/** The dropped stacks of a dimension's store, by their actors. */
const itemsOf = (live: LiveEntityRuntime): ItemEntity[] =>
    [...live.actors.all()].filter((actor): actor is ItemEntity => actor instanceof ItemEntity);

/**
 * A break, all the way to the packet that puts the dropped stack on someone's screen.
 *
 * The other break tests stop at `addEntity`, which is where this one starts: the drop is
 * created, added to the world for real, offered to whoever is near through the real
 * replicator, and told to show itself. Everything in that chain was correct on its own while
 * no floating item ever appeared, so the value here is that it is one test rather than five.
 */
const fakeWorld = (initial: BlockState, { id = 1, dropName = initial.name } = {}) => {
    let current = initial;
    const sent: any[] = [];

    const block: any = {
        getName: () => dropName,
        getStateName: () => initial.name,
        getId: () => id,
        getMeta: () => 0,
        getDrops: () => [block]
    };

    const chunk: any = {
        getBlock: () => current,
        getMinY: () => -64,
        getMaxY: () => 319,
        getBlockRuntimeId: () => BlockRuntimeIds.get(current),
        setBlockRuntimeId: (_x: number, _y: number, _z: number, runtimeId: number) => {
            current = BlockRuntimeIds.getState(runtimeId) ?? new BlockState('minecraft:air');
        }
    };

    // A session that shows what it is given, rather than recording that it was asked. The
    // spawn goes through the replicated entity's `spawnTo`, which is what picks `AddItemActor`
    // over the generic `AddActor` - a choice no test covered. The packets are the shared batch's,
    // encoded as they would be for the wire.
    const session: any = {
        runtimeId: 99n,
        send: async (packet: any) => void sent.push(packet),
        sendDataPacket: async (packet: any) => void sent.push(packet),
        getConnection: () => ({
            codec: Codec2193,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            compressionThreshold: 256,
            sendSharedBatch: async (_content: Buffer, packets: readonly unknown[]) => void sent.push(...packets)
        }),
        considerEntity: async (entity: any) => entity.spawnTo(session),
        // Where the player stands and how far it sees, which the drop's audience is chosen by.
        getViewPosition: () => new Vector3(10, 64, -20),
        getViewDistance: () => 10
    };

    const player: any = {
        gamemode: Gametype.SURVIVAL,
        pitch: 0,
        yaw: 0,
        getRuntimeId: () => 99n,
        getInventory: () => ({ getItemInHand: () => null }),
        getNetworkSession: () => session,
        getPosition: () => new Vector3(10, 64, -20),
        getUUID: () => ({ toString: () => 'thrower' }),
        viewDistance: 10
    };

    // Where a drop becomes a store stack, and whose index the world files it in.
    let world: World | undefined;
    const live = liveTestEntities(() => world);
    const items = () => itemsOf(live.entityRuntime(Dimensions.Overworld.name));
    world = Object.assign(Object.create(World.prototype), {
        tickHeader: () => QUIET_TICK_HEADER,
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        dimension: Dimensions.Overworld,
        level: fakeLevel(),
        blockUpdates: new BlockUpdateScheduler(),
        systems: { onBlockChanged: () => {}, updateAround: () => {} },
        players: new Map(),
        getChunkAt: async () => chunk,
        getBlock: async () => block,
        getViewers: () => [session],
        getEntities: () => [],
        getActors: () => [],
        sendWorldEvent: async () => {},
        server: {
            getConfig: () => ({ getProximityBroadcast: () => true, getPacketCompressionLevel: () => 7 }),
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {}, warn: () => {} }),
            // Every roll in the middle, so the drop starts at the middle of the block, still
            // pushed 0.2 upward.
            getRandom: () => () => 0.5,
            // The two-block fixture, which covers neither the block broken here nor any
            // family, so the break falls through to the block's own drops - which is the
            // path these tests are about.
            getContent: () => live.content(),
            getEntityRuntime: (dimension: string) => live.entityRuntime(dimension)
        }
    });
    if (world === undefined) throw new Error('unreachable');

    const replicator = new NetworkWorldReplicator(world, world.getServer());
    world.attachChangeSink(replicator);
    /** Breaks a block inside a tick of the world's log, and sends what the tick changed. */
    const breakLogged = async (at: Vector3, by?: Parameters<World['breakBlock']>[1]) => {
        world!.beginChangeTick();
        await world!.breakBlock(at, by);
        const sealed = world!.sealChangeTick();
        if (sealed !== undefined) replicator.tickSealed(sealed);
        await replicateEntities(replicator);
    };

    return { world, player, sent, items, breakLogged };
};

/**
 * A world with nothing in it but the entity map and a logger.
 *
 * {@link fakeWorld} goes all the way to the wire, which is the point of it and the wrong
 * shape for a test that drops thousands of stacks: the limit is about how many entities the
 * world keeps, not about what any of them sent.
 */
const emptyWorld = () => {
    const warnings: string[] = [];
    // Counted, so a test can say how many rolls the drops took. Each is the middle of its range.
    let rolls = 0;

    // Where a drop becomes a store stack, and whose index the world files it in.
    let world: World | undefined;
    const live = liveTestEntities(() => world);
    const items = () => itemsOf(live.entityRuntime(Dimensions.Overworld.name));
    world = Object.assign(Object.create(World.prototype), {
        tickHeader: () => QUIET_TICK_HEADER,
        name: 'flooded',
        dimension: Dimensions.Overworld,
        players: new Map(),
        chunks: new Map(),
        level: fakeLevel(),
        changes: NULL_WORLD_CHANGE_SINK,
        server: {
            getLogger: () => ({ debug: () => {}, warn: (message: string) => void warnings.push(message) }),
            getContent: () => live.content(),
            getEntityRuntime: (dimension: string) => live.entityRuntime(dimension),
            getRandom: () => () => {
                rolls += 1;
                return 0.5;
            }
        }
    });
    if (world === undefined) throw new Error('unreachable');

    return { world, items, warnings, rolls: () => rolls };
};

describe('world', () => {
    describe('block drops', () => {
        it('puts the dropped stack on the wire as an item actor', async () => {
            const { breakLogged, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await breakLogged(new Vector3(10, 64, -20), player);

            const spawn = sent.find((packet) => packet instanceof AddItemActorPacket);
            expect(spawn).toBeDefined();
            // A generic `AddActor` in its place is an entity the client renders as nothing.
            const data = spawn!.getPacketData();
            if (data === null) throw new Error('AddItemActorPacket has no payload');
            expect(data.item.id).toBeGreaterThan(0);
        });

        it('starts the drop inside the block that broke, and tells the client how fast it leaves', async () => {
            const { breakLogged, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await breakLogged(new Vector3(10, 64, -20), player);

            const spawn = sent.find((packet) => packet instanceof AddItemActorPacket)!;
            const data = spawn.getPacketData();
            if (data === null) throw new Error('AddItemActorPacket has no payload');
            // Outside it and the stack visibly sits inside the neighboring block. The 0.125 is
            // how far above where it lies BDS reports an item.
            expect([data.position.getX(), data.position.getY(), data.position.getZ()]).toEqual([10.5, 64.625, -19.5]);
            expect([data.motion.getX(), data.motion.getY(), data.motion.getZ()]).toEqual([0, 0.2, 0]);
        });

        it('adds the drop to the world, so it ticks and can be picked up', async () => {
            const { world, player, items } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(items().length).toBe(1);
        });

        it('throws a player drop from eye height and delays pickup for forty ticks', async () => {
            const { world, player, items } = fakeWorld(new BlockState('minecraft:stone'));

            await world.dropFromPlayer(player, [new Item({ runtimeId: 1, name: 'minecraft:stone', meta: 0 })]);

            const dropped = items()[0];
            if (!(dropped instanceof ItemEntity)) throw new Error('the player drop did not create an item entity');

            expect([dropped.getPosition().getX(), dropped.getPosition().getY(), dropped.getPosition().getZ()]).toEqual([
                10, 63.7, -20
            ]);
            expect(dropped.getMotion().getX()).toBeCloseTo(-0.01);
            expect(dropped.getMotion().getY()).toBeCloseTo(0.1);
            expect(dropped.getMotion().getZ()).toBeCloseTo(0.3);
            expect(dropped.savedItem()?.pickupDelay).toBe(40);
        });

        it('drops the whole stack a player let go of as one stack of the same size', async () => {
            const { world, player, items } = fakeWorld(new BlockState('minecraft:stone'));

            await world.dropFromPlayer(player, [
                new Item({ runtimeId: 1, name: 'minecraft:stone', meta: 0, count: 2 })
            ]);

            const dropped = items();
            expect(dropped).toHaveLength(1);
            expect(dropped[0]?.savedItem()?.stack.count).toBe(2);
            expect(dropped[0]?.getItem()?.getCount()).toBe(2);
        });

        it('drops nothing for a block whose drop has no item id, rather than air', async () => {
            // On the wire it was an item actor holding air: an empty item on the ground.
            const { world, player, sent, items } = fakeWorld(new BlockState('minecraft:cobblestone'), {
                id: 0,
                dropName: 'minecraft:not_an_item'
            });

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(sent.some((packet) => packet instanceof AddItemActorPacket)).toBe(false);
            expect(items().length).toBe(0);
        });

        it('stops at the item entity limit however much is dropped at once', async () => {
            // The reported crash: a world that had just generated a region started ticking
            // it, leaf decay broke tens of thousands of leaves, and every break rolled a
            // loot table through here. Nothing counted the stacks already on the ground.
            const { world, items, warnings } = emptyWorld();
            const position = new Vector3(10, 64, -20);
            const stacks = (count: number) =>
                Array.from({ length: count }, () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 }));

            for (let burst = 0; burst < 3; burst += 1) {
                await world.dropContents(position, stacks(World.ITEM_ENTITY_LIMIT));
            }

            expect(items().length).toBe(World.ITEM_ENTITY_LIMIT);
            // Said once rather than once per lost stack, which would be the same flood.
            expect(warnings).toHaveLength(1);

            // And the room comes back, so a world that fills up once is not full for ever.
            const [first] = items();
            if (first !== undefined) world.dataEntities().runtime.remove(first.entity.id, 'body removed');
            await world.dropContents(position, stacks(4));

            expect(items().length).toBe(World.ITEM_ENTITY_LIMIT);
        });

        it('preserves an explicit zero item count', () => {
            expect(Item.air().getAmount()).toBe(0);
            expect(new Item({ name: 'minecraft:stone', count: 0 }).getAmount()).toBe(0);
        });

        it('does not turn empty stacks into dropped item actors', async () => {
            const { world, items } = emptyWorld();

            await world.dropContents(new Vector3(0, 64, 0), [
                Item.air(),
                new Item({ name: 'minecraft:air', count: 1 }),
                new Item({ name: 'minecraft:stone', count: 0 })
            ]);

            expect(items().length).toBe(0);
        });

        it('pops every stack out of the block it came from, and rolls none for a stack turned away', async () => {
            // An explosion, a falling block with nowhere to land and a block behavior's drop
            // all go through here. Without the push their stacks lie a whole block apart, where
            // the half-block merge reach never joins them.
            const { world, items, rolls } = emptyWorld();
            const cobblestone = () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 });

            await world.dropFromBlock({ x: 3, y: 70, z: -4 }, [cobblestone(), null, cobblestone()]);

            const dropped = items();
            expect(dropped).toHaveLength(2);
            for (const entity of dropped) {
                expect([entity.getPosition().getX(), entity.getFeetY(), entity.getPosition().getZ()]).toEqual([
                    3.5, 70.5, -3.5
                ]);
                expect(entity.getMotion().getY()).toBe(0.2);
            }
            expect(rolls()).toBe(10);

            // The limit takes its slice before the spot is rolled.
            const full = emptyWorld();
            const flood = Array.from({ length: World.ITEM_ENTITY_LIMIT + 3 }, cobblestone);
            await full.world.dropFromBlock({ x: 0, y: 64, z: 0 }, flood);
            expect(full.rolls()).toBe(World.ITEM_ENTITY_LIMIT * 5);
        });

        it('leaves a stack it is told where to put still, lying at that spot', async () => {
            const { world, items, rolls } = emptyWorld();

            await world.dropContents(new Vector3(1.5, 65, 2.5), [new Item({ name: 'minecraft:cobblestone' })]);

            const [dropped] = items();
            if (!(dropped instanceof ItemEntity)) throw new Error('no item entity was added');
            expect(dropped.getFeetY()).toBe(65);
            expect(dropped.getPosition().getY()).toBe(65.125);
            expect(dropped.getMotion().getY()).toBe(0);
            expect(rolls()).toBe(0);
        });

        it('puts a stack on the ground without the stack network id it had', async () => {
            // Ids are counted per player, so one carried onto the ground could name another of
            // the stacks of whoever picks it up.
            const { world, items } = emptyWorld();
            const held = new Item({ name: 'minecraft:cobblestone', count: 3 });
            held.stackNetworkId = 9;

            await world.dropContents(new Vector3(10, 64, -20), [held]);

            const [dropped] = items();
            if (!(dropped instanceof ItemEntity)) throw new Error('no item entity was added');
            expect(dropped.getItem()?.getItem().stackNetworkId).toBe(0);
            expect(dropped.getItem()?.getItem().getAmount()).toBe(3);
            // A copy: the stack the caller still holds keeps its id.
            expect(held.stackNetworkId).toBe(9);
        });

        it('drops nothing in creative, where breaking is not mining', async () => {
            const { world, player, sent, items } = fakeWorld(new BlockState('minecraft:cobblestone'));
            player.gamemode = Gametype.CREATIVE;

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(sent.some((packet) => packet instanceof AddItemActorPacket)).toBe(false);
            expect(items().length).toBe(0);
        });
    });
});
