import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import type { Entity } from '../entity/Entity';
import { Item as ItemEntity } from '../entity/other/Item';
import { Item } from '../item/Item';
import { NetworkWorldReplicator } from '../network/NetworkWorldReplicator';
import AddItemActorPacket from '../network/packet/AddItemActorPacket';
import PlayerSession from '../network/PlayerSession';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

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
    // spawn goes through `Entity.spawnTo`, which is what picks `AddItemActor` over the
    // generic `AddActor` - a choice no test covered. The packet is the session's own, encoded
    // as it would be for the wire.
    const session: any = {
        send: async (packet: any) => void sent.push(packet),
        sendDataPacket: async (packet: any) => void sent.push(packet),
        connection: {
            sendDataPacket: async (packet: any) => {
                packet.encode();
                sent.push(packet);
            }
        },
        considerEntity: async (entity: any) => entity.spawnTo(session),
        sendAddItemActor: PlayerSession.prototype.sendAddItemActor
    };

    const player: any = {
        gamemode: Gametype.SURVIVAL,
        getInventory: () => ({ getItemInHand: () => null }),
        getNetworkSession: () => session,
        getPosition: () => new Vector3(10, 64, -20),
        viewDistance: 10
    };

    // The real one, so `addEntity` has somewhere to put what it is given - and handed back,
    // because the world keeps no public count of what it holds.
    const entities = new Map<bigint, Entity>();

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        entityChunkIndices: new Map(),
        currentTick: 0,
        blockUpdates: new BlockUpdateScheduler(),
        systems: { onBlockChanged: () => {}, updateAround: () => {} },
        entities,
        players: new Map(),
        getChunkAt: async () => chunk,
        getBlock: async () => block,
        getPlayers: () => [player],
        getEntities: () => [],
        sendWorldEvent: async () => {},
        server: {
            getConfig: () => ({ getProximityBroadcast: () => true }),
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {}, warn: () => {} }),
            // Every roll in the middle, so the drop starts at the middle of the block, still
            // pushed 0.2 upward.
            getRandom: () => () => 0.5,
            // The two-block fixture, which covers neither the block broken here nor any
            // family, so the break falls through to the block's own drops - which is the
            // path these tests are about.
            getContent: () => testContent()
        }
    });

    world.attachChangeSink(new NetworkWorldReplicator(world, world.getServer()));

    return { world, player, sent, entities };
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
    const entities = new Map<bigint, Entity>();
    // Counted, so a test can say how many rolls the drops took. Each is the middle of its range.
    let rolls = 0;

    const world: World = Object.assign(Object.create(World.prototype), {
        name: 'flooded',
        entities,
        players: new Map(),
        entityChunkIndices: new Map(),
        chunks: new Map(),
        currentTick: 0,
        changes: NULL_WORLD_CHANGE_SINK,
        server: {
            getLogger: () => ({ debug: () => {}, warn: (message: string) => void warnings.push(message) }),
            getContent: () => testContent(),
            getRandom: () => () => {
                rolls += 1;
                return 0.5;
            }
        }
    });

    return { world, entities, warnings, rolls: () => rolls };
};

describe('world', () => {
    describe('block drops', () => {
        it('puts the dropped stack on the wire as an item actor', async () => {
            const { world, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            const spawn = sent.find((packet) => packet instanceof AddItemActorPacket);
            expect(spawn).toBeDefined();
            // A generic `AddActor` in its place is an entity the client renders as nothing.
            expect(spawn!.item.getName()).toBe('minecraft:cobblestone');
            expect(spawn!.item.getNetworkId()).toBeGreaterThan(0);
        });

        it('starts the drop inside the block that broke, and tells the client how fast it leaves', async () => {
            const { world, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            const spawn = sent.find((packet) => packet instanceof AddItemActorPacket)!;
            // Outside it and the stack visibly sits inside the neighboring block. The 0.125 is
            // how far above where it lies BDS reports an item.
            expect([spawn.position.getX(), spawn.position.getY(), spawn.position.getZ()]).toEqual([
                10.5, 64.625, -19.5
            ]);
            expect([spawn.motion.getX(), spawn.motion.getY(), spawn.motion.getZ()]).toEqual([0, 0.2, 0]);
        });

        it('adds the drop to the world, so it ticks and can be picked up', async () => {
            const { world, player, entities } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(entities.size).toBe(1);
        });

        it('drops nothing for a block whose drop has no item id, rather than air', async () => {
            // On the wire it was an item actor holding air: an empty item on the ground.
            const { world, player, sent, entities } = fakeWorld(new BlockState('minecraft:cobblestone'), {
                id: 0,
                dropName: 'minecraft:not_an_item'
            });

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(sent.some((packet) => packet instanceof AddItemActorPacket)).toBe(false);
            expect(entities.size).toBe(0);
        });

        it('stops at the item entity limit however much is dropped at once', async () => {
            // The reported crash: a world that had just generated a region started ticking
            // it, leaf decay broke tens of thousands of leaves, and every break rolled a
            // loot table through here. Nothing counted the stacks already on the ground.
            const { world, entities, warnings } = emptyWorld();
            const position = new Vector3(10, 64, -20);
            const stacks = (count: number) =>
                Array.from({ length: count }, () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 }));

            for (let burst = 0; burst < 3; burst += 1) {
                await world.dropContents(position, stacks(World.ITEM_ENTITY_LIMIT));
            }

            expect(entities.size).toBe(World.ITEM_ENTITY_LIMIT);
            // Said once rather than once per lost stack, which would be the same flood.
            expect(warnings).toHaveLength(1);

            // And the room comes back, so a world that fills up once is not full for ever.
            await world.removeEntity([...entities.values()][0]!);
            await world.dropContents(position, stacks(4));

            expect(entities.size).toBe(World.ITEM_ENTITY_LIMIT);
        });

        it('preserves an explicit zero item count', () => {
            expect(Item.air().getAmount()).toBe(0);
            expect(new Item({ name: 'minecraft:stone', count: 0 }).getAmount()).toBe(0);
        });

        it('does not turn empty stacks into dropped item actors', async () => {
            const { world, entities } = emptyWorld();

            await world.dropContents(new Vector3(0, 64, 0), [
                Item.air(),
                new Item({ name: 'minecraft:air', count: 1 }),
                new Item({ name: 'minecraft:stone', count: 0 })
            ]);

            expect(entities.size).toBe(0);
        });

        it('pops every stack out of the block it came from, and rolls none for a stack turned away', async () => {
            // An explosion, a falling block with nowhere to land and a block behavior's drop
            // all go through here. Without the push their stacks lie a whole block apart, where
            // the half-block merge reach never joins them.
            const { world, entities, rolls } = emptyWorld();
            const cobblestone = () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 });

            await world.dropFromBlock({ x: 3, y: 70, z: -4 }, [cobblestone(), null, cobblestone()]);

            const dropped = [...entities.values()].filter((entity) => entity instanceof ItemEntity);
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
            const { world, entities, rolls } = emptyWorld();

            await world.dropContents(new Vector3(1.5, 65, 2.5), [new Item({ name: 'minecraft:cobblestone' })]);

            const [dropped] = entities.values();
            if (!(dropped instanceof ItemEntity)) throw new Error('no item entity was added');
            expect(dropped.getFeetY()).toBe(65);
            expect(dropped.getPosition().getY()).toBe(65.125);
            expect(dropped.getMotion().getY()).toBe(0);
            expect(rolls()).toBe(0);
        });

        it('puts a stack on the ground without the stack network id it had', async () => {
            // Ids are counted per player, so one carried onto the ground could name another of
            // the stacks of whoever picks it up.
            const { world, entities } = emptyWorld();
            const held = new Item({ name: 'minecraft:cobblestone', count: 3 });
            held.stackNetworkId = 9;

            await world.dropContents(new Vector3(10, 64, -20), [held]);

            const [dropped] = entities.values();
            if (!(dropped instanceof ItemEntity)) throw new Error('no item entity was added');
            expect(dropped.getItem()?.getItem().stackNetworkId).toBe(0);
            expect(dropped.getItem()?.getItem().getAmount()).toBe(3);
            // A copy: the stack the caller still holds keeps its id.
            expect(held.stackNetworkId).toBe(9);
        });

        it('drops nothing in creative, where breaking is not mining', async () => {
            const { world, player, sent, entities } = fakeWorld(new BlockState('minecraft:cobblestone'));
            player.gamemode = Gametype.CREATIVE;

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(sent.some((packet) => packet instanceof AddItemActorPacket)).toBe(false);
            expect(entities.size).toBe(0);
        });
    });
});
