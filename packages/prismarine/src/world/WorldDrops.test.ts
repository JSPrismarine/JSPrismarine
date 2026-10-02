import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import { NetworkWorldReplicator } from '../network/NetworkWorldReplicator';
import AddItemActorPacket from '../network/packet/AddItemActorPacket';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import Chunk from './chunk/Chunk';
import { World } from './World';

/**
 * A break, all the way to the packet that puts the dropped stack on someone's screen.
 *
 * The other break tests stop at `addEntity`, which is where this one starts: the drop is
 * created, added to the world for real, offered to whoever is near through the real
 * replicator, and told to show itself. Everything in that chain was correct on its own while
 * no floating item ever appeared, so the value here is that it is one test rather than five.
 */
const fakeWorld = (initial: BlockState) => {
    let current = initial;
    const sent: any[] = [];

    const block: any = {
        getName: () => initial.name,
        getStateName: () => initial.name,
        getId: () => 1,
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
    // generic `AddActor` - a choice no test covered.
    const session: any = {
        send: async (packet: any) => void sent.push(packet),
        sendDataPacket: async (packet: any) => void sent.push(packet),
        considerEntity: async (entity: any) => entity.spawnTo(session),
        sendAddItemActor: async (item: any) => {
            const packet = new AddItemActorPacket();
            packet.runtimeEntityId = item.getRuntimeId();
            packet.position = item.getPosition();
            packet.item = item.getItem()!.getItem();
            packet.metadata = item.metadata;
            packet.encode();
            sent.push(packet);
        }
    };

    const player: any = {
        gamemode: Gametype.SURVIVAL,
        getInventory: () => ({ getItemInHand: () => null }),
        getNetworkSession: () => session,
        getPosition: () => new Vector3(10, 64, -20),
        viewDistance: 10
    };

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        currentTick: 0,
        blockUpdates: new BlockUpdateScheduler(),
        // The real ones, so `addEntity` has somewhere to put what it is given.
        entities: new Map(),
        players: new Map(),
        getChunkAt: async () => chunk,
        getBlock: async () => block,
        getPlayers: () => [player],
        getEntities: () => [],
        sendWorldEvent: async () => {},
        server: {
            getBlockManager: () => ({
                getBlock: (name: string) => ({ getName: () => name, getStateName: () => name })
            }),
            getConfig: () => ({ getProximityBroadcast: () => true }),
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {} })
        }
    });

    world.attachChangeSink(new NetworkWorldReplicator(world, (world as any).server));

    return { world, player, sent };
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

        it('lands the drop at the centre of the block that broke', async () => {
            const { world, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            const spawn = sent.find((packet) => packet instanceof AddItemActorPacket)!;
            // Off-centre and the stack visibly sits inside the neighbouring block.
            expect([spawn.position.getX(), spawn.position.getY(), spawn.position.getZ()]).toEqual([10.5, 64.5, -19.5]);
        });

        it('adds the drop to the world, so it ticks and can be picked up', async () => {
            const { world, player } = fakeWorld(new BlockState('minecraft:cobblestone'));

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(world.getEntityCount?.() ?? (world as any).entities.size).toBe(1);
        });

        it('drops nothing in creative, where breaking is not mining', async () => {
            const { world, player, sent } = fakeWorld(new BlockState('minecraft:cobblestone'));
            player.gamemode = Gametype.CREATIVE;

            await world.breakBlock(new Vector3(10, 64, -20), player);

            expect(sent.some((packet) => packet instanceof AddItemActorPacket)).toBe(false);
            expect((world as any).entities.size).toBe(0);
        });
    });
});
