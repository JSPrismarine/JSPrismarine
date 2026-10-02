import { Vector3 } from '@jsprismarine/math';
import { ActorEvent } from '@jsprismarine/minecraft';
import { EYE_HEIGHT } from '../Human';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../../inventory/ContainerEntry';
import { Item as ItemStack } from '../../item/Item';
import TakeItemActorPacket from '../../network/packet/TakeItemActorPacket';
import MoveActorAbsolutePacket from '../../network/packet/MoveActorAbsolutePacket';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import { Item } from './Item';

/**
 * A world with a floor: everything at or below `groundY` is solid, everything above is air.
 * Enough for an item to have somewhere to land.
 */
const fakeWorld = (groundY: number) => {
    const players: any[] = [];
    const removed: any[] = [];
    const events: Array<{ event: number; data: number }> = [];
    // The real one: merging asks it who is nearby, exactly as a mob does.
    const grid = new EntityGrid();

    return {
        players,
        removed,
        events,
        grid,
        getEntityGrid: () => grid,
        // Only ever reached when a failing expectation prints an entity.
        getName: () => 'test',
        // An entity takes its server from the world its position names.
        getServer: () => ({}),
        getBlock: async (_x: number, y: number) => ({ isSolid: () => y <= groundY }),
        getPlayers: () => players,
        removeEntity: async (entity: any) => void removed.push(entity),
        // How a merge reaches the client: there is no packet that updates a dropped stack,
        // so the new size travels as an actor event.
        sendActorEvent: async (_entity: any, event: number, data: number) => void events.push({ event, data }),
        // Mirrors the real one: telling everybody an entity moved is the world's job now,
        // not something the entity does to itself.
        broadcastMove: async (entity: any) => {
            const pk = new MoveActorAbsolutePacket();
            pk.runtimeEntityId = entity.getRuntimeId();
            pk.position = entity.getPosition();
            await Promise.all(players.map(async (player) => player.getNetworkSession().send(pk)));
        }
    };
};

const fakePlayer = (x: number, y: number, z: number) => {
    const sent: any[] = [];
    const held: ContainerEntry[] = [];

    return {
        sent,
        held,
        // A player is no longer a position itself, it has one - and the one it reports is its
        // eyes, `EYE_HEIGHT` above its feet. This used to report the feet, which is why every
        // pickup test passed while no player could pick anything up: an item on the floor is
        // 1.62 from the eyes and the reach is 1.5, so the real geometry never came up.
        getPosition: () => new Vector3(x, y + EYE_HEIGHT, z),
        getFeetY: () => y,
        getRuntimeId: () => 99n,
        isOnline: () => true,
        getInventory: () => ({ addItem: (entry: ContainerEntry) => void held.push(entry) }),
        viewDistance: 10,
        getNetworkSession: () => ({
            send: async (packet: any) => void sent.push(packet),
            // Standing on top of the item, so everything nearby is on screen.
            tracks: () => true,
            // The take packet animates the stack flying in but does not say what the
            // inventory now holds, so a pickup resends it.
            sendInventory: async () => void sent.push('inventory'),
            getConnection: () => ({ sendDataPacket: async (packet: any) => void sent.push(packet) })
        })
    };
};

const droppedAt = (world: any, y: number) =>
    new Item({
        item: new ContainerEntry({ item: new ItemStack({ id: 1, name: 'minecraft:dirt' }), count: 1 }),
        position: new Position(0.5, y, 0.5, world)
    });

/** Runs `n` ticks, the way the world does. */
const tick = async (entity: Item, n: number) => {
    for (let i = 0; i < n; i++) await entity.update(i);
};

describe('entity', () => {
    describe('Item', () => {
        describe('gravity', () => {
            it('falls to the surface of the block below and stops there', async () => {
                // Ground fills y <= 63, so the top of the world's floor is y = 64.
                const world = fakeWorld(63);
                const item = droppedAt(world, 70);

                await tick(item, 60);

                expect(item.getPosition().getY()).toBe(64);
            });

            it('lands on the surface rather than wherever the last step happened to end', async () => {
                // Dropped from high enough that a tick's fall is much taller than a block, so
                // stepping without clamping would bury it.
                const world = fakeWorld(63);
                const item = droppedAt(world, 200);

                await tick(item, 200);

                expect(item.getPosition().getY()).toBe(64);
            });

            it('says nothing once it has settled', async () => {
                // An item at rest that kept broadcasting would cost a packet per player per
                // tick, for as long as it lay there.
                const world = fakeWorld(63);
                const player = fakePlayer(100, 64, 100); // too far away to take it
                world.players.push(player);
                const item = droppedAt(world, 64.5);

                await tick(item, 30);
                const afterLanding = player.sent.filter((pk) => pk instanceof MoveActorAbsolutePacket).length;

                await tick(item, 30);

                expect(player.sent.filter((pk) => pk instanceof MoveActorAbsolutePacket)).toHaveLength(afterLanding);
            });
        });

        describe('merging', () => {
            /** Two stacks side by side on the floor, and a grid that knows where they are. */
            const lying = (world: any, items: Array<{ name: string; count: number; x: number }>) => {
                const entities = items.map(
                    ({ name, count, x }) =>
                        new Item({
                            item: new ContainerEntry({ item: new ItemStack({ id: 0, name, count }), count }),
                            position: new Position(x, 64, 0.5, world)
                        })
                );
                world.grid.rebuild(entities);

                return entities;
            };

            it('draws a neighbouring stack of the same thing into one', async () => {
                // Mining a seam leaves a dozen entities where there should be one, each
                // ticking, each falling, each broadcast to everyone who comes near.
                const world = fakeWorld(63);
                const [first, second] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 1, x: 0.5 },
                    { name: 'minecraft:cobblestone', count: 1, x: 0.6 }
                ]);

                await first!.update(1);

                expect(first!.getItem()!.getItem().getAmount()).toBe(2);
                // Both counts: an entity holds the number twice, and the pickup path reads
                // the entry's rather than the stack's.
                expect(first!.getItem()!.getCount()).toBe(2);
                expect(world.removed).toContain(second);
            });

            it('leaves a different item alone', async () => {
                const world = fakeWorld(63);
                const [stone, dirt] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 1, x: 0.5 },
                    { name: 'minecraft:dirt', count: 1, x: 0.55 }
                ]);

                await stone!.update(1);

                expect(stone!.getItem()!.getItem().getAmount()).toBe(1);
                expect(world.removed).not.toContain(dirt);
            });

            it('reaches across the gap two neighbouring blocks drop at', async () => {
                // Where the reach has to be. Breaking two blocks side by side leaves the drops
                // exactly one block apart, and this server does not give them the horizontal
                // drift that would bring them together - so at vanilla's half a block they
                // would lie there separately for ever.
                const world = fakeWorld(63);
                const [first, second] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 1, x: 10.5 },
                    { name: 'minecraft:cobblestone', count: 1, x: 11.5 }
                ]);

                await first!.update(1);

                expect(first!.getItem()!.getItem().getAmount()).toBe(2);
                expect(world.removed).toContain(second);
            });

            it('leaves one out of reach alone', async () => {
                const world = fakeWorld(63);
                const [near, far] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 1, x: 0.5 },
                    { name: 'minecraft:cobblestone', count: 1, x: 8 }
                ]);

                await near!.update(1);

                expect(world.removed).not.toContain(far);
            });

            it('leaves two stacks that will not both fit', async () => {
                // All of it or none of it, as in vanilla. A part moved across leaves a
                // remainder with no visible reason, and the client is told a stack size
                // rather than a difference - so a half-move has to be described twice.
                const world = fakeWorld(63);
                const [big, rest] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 60, x: 0.5 },
                    { name: 'minecraft:cobblestone', count: 10, x: 0.55 }
                ]);

                await big!.update(1);
                await rest!.update(1);

                expect(big!.getItem()!.getItem().getAmount()).toBe(60);
                expect(rest!.getItem()!.getItem().getAmount()).toBe(10);
                expect(world.removed).toHaveLength(0);
            });

            it('tells the client the survivor grew', async () => {
                // `AddItemActor` carries the item and is only sent when the entity appears,
                // so without this the merge is invisible: two items become one on the ground
                // while the survivor still shows the count it was dropped with.
                const world = fakeWorld(63);
                const [first] = lying(world, [
                    { name: 'minecraft:cobblestone', count: 1, x: 0.5 },
                    { name: 'minecraft:cobblestone', count: 1, x: 0.6 }
                ]);

                await first!.update(1);

                expect(world.events).toEqual([{ event: ActorEvent.UPDATE_STACK_SIZE, data: 2 }]);
            });
        });

        describe('pickup', () => {
            it('goes to a player standing over it, and leaves the world', async () => {
                const world = fakeWorld(63);
                const player = fakePlayer(0.5, 64, 0.5);
                world.players.push(player);
                const item = droppedAt(world, 64);

                await tick(item, 20);

                expect(player.held).toHaveLength(1);
                expect(player.held[0]!.getItem().getName()).toBe('minecraft:dirt');

                const take = player.sent.find((pk) => pk instanceof TakeItemActorPacket)!;
                expect(take.itemRuntimeEntityId).toBe(item.getRuntimeId());
                expect(take.takerRuntimeEntityId).toBe(99n);

                expect(world.removed).toContain(item);
            });

            it('waits before it can be taken, so it is seen before it is gone', async () => {
                // The player who broke the block is standing right on it.
                const world = fakeWorld(63);
                const player = fakePlayer(0.5, 64, 0.5);
                world.players.push(player);
                const item = droppedAt(world, 64);

                await tick(item, 9);

                expect(player.held).toHaveLength(0);
                expect(world.removed).toHaveLength(0);
            });

            it('is taken once, however many ticks run afterwards', async () => {
                const world = fakeWorld(63);
                const player = fakePlayer(0.5, 64, 0.5);
                world.players.push(player);
                const item = droppedAt(world, 64);

                await tick(item, 60);

                expect(player.held).toHaveLength(1);
                expect(world.removed).toHaveLength(1);
            });

            it('reaches a player whose eyes are further away than the reach itself', async () => {
                // The whole bug, as arithmetic: a player standing on an item is 1.62 from it
                // measured to their eyes, and the reach is 1.5. Measured point to point,
                // nothing was ever in range - standing directly on top of a stack included.
                const world = fakeWorld(63);
                const player = fakePlayer(0.5, 64, 0.5);
                world.players.push(player);
                const item = droppedAt(world, 64);

                expect(player.getPosition().getY() - item.getPosition().getY()).toBeGreaterThan(1.5);

                await tick(item, 20);

                expect(player.held).toHaveLength(1);
            });

            it('stays put when everyone is out of reach', async () => {
                const world = fakeWorld(63);
                const player = fakePlayer(4, 64, 4);
                world.players.push(player);
                const item = droppedAt(world, 64);

                await tick(item, 40);

                expect(player.held).toHaveLength(0);
                expect(world.removed).toHaveLength(0);
            });
        });
    });
});
