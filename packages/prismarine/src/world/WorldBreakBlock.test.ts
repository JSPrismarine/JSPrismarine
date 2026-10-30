import { Gametype, LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import { NetworkWorldReplicator } from '../network/NetworkWorldReplicator';
import Codec2193 from '../network/codec/Codec2193';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import UpdateBlockPacket, { UpdateBlockFlagsType } from '@jsprismarine/protocol/packet/UpdateBlockPacket';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import { World } from './World';

/**
 * A world reduced to what breaking a block touches. The real one wants a server, a provider
 * and a directory on disk before it will exist at all, none of which this is about.
 */
/** A block that yields itself, the way most of them do. */
const fakeBlock = (name: string, drops: any[] | null = null) => {
    const block: any = {
        getName: () => name,
        getStateName: () => name,
        getId: () => 1,
        getMeta: () => 0,
        getDrops: () => drops ?? [block]
    };

    return block;
};

const fakeWorld = (initial: BlockState, broken = fakeBlock(initial.name)) => {
    let current = initial;
    const sent: any[] = [];
    const spawned: any[] = [];
    const events: Array<{ position: Vector3 | null; event: LevelEvent; data: number }> = [];

    /**
     * Batches of block changes, which no longer travel one packet at a time.
     *
     * `blockChanged` records; the tick flushes. A test that breaks a block outside a tick has to
     * flush by hand, which is what {@link flush} below is for.
     */
    const batches: Buffer[] = [];

    const session = {
        send: async (packet: any) => void sent.push(packet),
        getConnection: () => ({
            codec: Codec2193,
            sendSharedBatch: (content: Buffer) => void batches.push(content)
        })
    };

    /**
     * A chunk holding exactly one block.
     *
     * It answers by runtime id as well as by state now, because breaking a block goes through
     * `setBlockRuntimeId` - the one primitive every block change uses, so that whatever the block
     * was holding up gets its chance to react.
     */
    const chunk: any = {
        getBlock: () => current,
        getMinY: () => -64,
        getMaxY: () => 319,
        getBlockRuntimeId: () => BlockRuntimeIds.get(current),
        setBlockRuntimeId: (_x: number, _y: number, _z: number, runtimeId: number) => {
            current = BlockRuntimeIds.getState(runtimeId) ?? new BlockState('minecraft:air');
        }
    };

    // Built on the real prototype, so that `breakBlock` and everything it reaches for -
    // `setBlockRuntimeId`, `dropContents`, `dropItem` - is the code under test rather than more of
    // the stand-in. Only what touches the disk, the network or a chunk is replaced.
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        // Empty and never written, because `addEntity` below replaces the real one. It is
        // here because a world with no entity map is not a world: `dropContents` counts the
        // stacks already on the ground before it adds another.
        entities: new Map(),
        currentTick: 0,
        blockUpdates: new BlockUpdateScheduler(),
        systems: { onBlockChanged: () => {}, updateAround: () => {} },
        getChunkAt: async () => chunk,
        getBlock: async () => broken,
        // Standing where these tests break their block, so the break is well inside both the
        // view distance and the tighter radius a sound carries. A position and a view distance
        // are needed at all now that block updates and sounds are addressed to whoever is near
        // enough rather than to every player in the world.
        getPlayers: () => [
            {
                getNetworkSession: () => session,
                getPosition: () => new Vector3(10, 64, -20),
                viewDistance: 10
            }
        ],
        sendWorldEvent: async (position: Vector3 | null, event: LevelEvent, data: number) => {
            events.push({ position, event, data });
        },
        addEntity: async (entity: any) => void spawned.push(entity),
        server: {
            getConfig: () => ({ getProximityBroadcast: () => true, getPacketCompressionLevel: () => 7 }),
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {} }),
            // Rolls taken in turn, so where a drop lands can be said exactly.
            getRandom: () => {
                const rolls = [0, 1, 0.5, 0, 1];
                return () => rolls.shift() ?? 0.5;
            },
            // The two-block fixture, which covers neither the block broken here nor any
            // family, so no `onBreak` runs and the block itself says what it drops - which is
            // the path these tests are about.
            getContent: () => testContent()
        }
    });

    // The real replicator over the fake world, so that what a break puts on the wire - and to
    // whom - is still the code under test. The world itself no longer builds those packets.
    const replicator = new NetworkWorldReplicator(world, world.getServer());
    world.attachChangeSink(replicator);

    return {
        break: async (position: Vector3, player?: any) => world.breakBlock(position, player),
        sent,
        spawned,
        events,

        /**
         * Ends the tick, as `World.update` would, and reads back what the block changes turned
         * into - decoded from the real batch, so the compression and framing are exercised rather
         * than assumed.
         * @returns {UpdateBlockPacket[]} The block updates the client would receive.
         */
        flush: async (): Promise<UpdateBlockPacket[]> => {
            await replicator.flushBlockChanges();

            return batches.flatMap((content) => {
                return BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB })
                    .decode(content)
                    .map((bytes) => {
                        const packet = new UpdateBlockPacket(bytes);
                        packet.decode();
                        return packet;
                    });
            });
        },

        get state() {
            return current;
        }
    };
};

/** A player in a given mode, holding nothing. */
const fakePlayer = (gamemode: Gametype) => ({
    gamemode,
    getRuntimeId: () => 7n,
    getPosition: () => new Vector3(10, 64, -20),
    getInventory: () => ({ getItemInHand: () => null })
});

describe('world', () => {
    describe('breakBlock', () => {
        it('removes the block and plays the break where it stood', async () => {
            // A log lying on its side, so that the id sent is demonstrably the state that was
            // there and not the block's default one.
            const log = new BlockState('minecraft:oak_log', { pillar_axis: 'x' });
            const world = fakeWorld(log);

            const broke = await world.break(new Vector3(10, 64, -20));

            expect(broke).toBe(true);
            expect(world.state.name).toBe('minecraft:air');

            // No sound packet: the destroy event below plays the sound, as BDS 1.26.52 sends it.
            expect(world.sent.some((pk) => pk instanceof LevelSoundEventPacket)).toBe(false);

            // Read back off the wire, where a runtime id is an unsigned varint: the ids are FNV
            // hashes kept as signed 32 bit numbers in the server, and the same bits unsigned here.
            const [update] = await world.flush();
            expect(update!.blockRuntimeId).toBe(BlockRuntimeIds.getByName('minecraft:air') >>> 0);
            expect([update!.x, update!.y, update!.z]).toEqual([10, 64, -20]);
            // Flagged as a change that came over the network, the bit every server sets.
            expect(update!.flags & UpdateBlockFlagsType.Network).toBe(UpdateBlockFlagsType.Network);

            // One event for the particles and the sound, at the block's center, carrying the
            // exact state that was there: the client textures and voices the break from it.
            expect(world.events).toEqual([
                {
                    position: new Vector3(10.5, 64.5, -19.5),
                    event: LevelEvent.PARTICLES_DESTROY_BLOCK,
                    data: BlockRuntimeIds.get(log)
                }
            ]);
            expect(world.events[0]!.data).not.toBe(BlockRuntimeIds.getByName('minecraft:oak_log'));
        });

        it('does nothing the second time, so both routes into a break can call it', async () => {
            // Survival announces a break through an InventoryTransaction and creative through
            // a PlayerAction; a client may send both. This is what stops that being heard as
            // two breaks.
            const world = fakeWorld(new BlockState('minecraft:oak_log', { pillar_axis: 'x' }));
            const position = new Vector3(10, 64, -20);

            expect(await world.break(position)).toBe(true);
            const afterFirst = world.sent.length;

            expect(await world.break(position)).toBe(false);
            expect(world.sent).toHaveLength(afterFirst);
            expect(world.events).toHaveLength(1);
        });

        it('drops what the block yields, from inside the block it was, as BDS does', async () => {
            const world = fakeWorld(new BlockState('minecraft:oak_log', { pillar_axis: 'x' }));

            await world.break(new Vector3(10, 64, -20), fakePlayer(Gametype.SURVIVAL));

            expect(world.spawned).toHaveLength(1);
            const [drop] = world.spawned;
            expect(drop.getType()).toBe('minecraft:item');
            expect(drop.getItem()!.getItem().getName()).toBe('minecraft:oak_log');
            // Within the middle 70% of the block on each axis, reported 0.125 higher, and pushed
            // out a little sideways and 0.2 up: what a Bedrock Dedicated Server 1.26.52 did
            // with 18 drops.
            const at = drop.getPosition();
            expect(at.getX()).toBeCloseTo(10.15);
            expect(at.getY()).toBeCloseTo(64.85 + 0.125);
            expect(at.getZ()).toBeCloseTo(-19.5);
            const motion = drop.getMotion();
            expect([motion.getX(), motion.getY(), motion.getZ()]).toEqual([-0.1, 0.2, 0.1]);
        });

        it('drops nothing in creative', async () => {
            const world = fakeWorld(new BlockState('minecraft:oak_log', { pillar_axis: 'x' }));

            await world.break(new Vector3(10, 64, -20), fakePlayer(Gametype.CREATIVE));

            expect(world.spawned).toHaveLength(0);
            // The break itself still happens, sound and all: the destroy event carries the sound.
            expect(world.state.name).toBe('minecraft:air');
            expect(world.events.map(({ event }) => event)).toEqual([LevelEvent.PARTICLES_DESTROY_BLOCK]);
        });

        it('drops nothing when the block yields nothing for the tool used', async () => {
            // Stone broken by hand: not a mistake, just an empty list.
            const world = fakeWorld(new BlockState('minecraft:stone'), fakeBlock('minecraft:stone', []));

            await world.break(new Vector3(0, 64, 0), fakePlayer(Gametype.SURVIVAL));

            expect(world.spawned).toHaveLength(0);
            expect(world.state.name).toBe('minecraft:air');
        });

        it('leaves air alone', async () => {
            const world = fakeWorld(new BlockState('minecraft:air'));

            expect(await world.break(new Vector3(0, 0, 0))).toBe(false);
            expect(world.sent).toHaveLength(0);
        });
    });
});
