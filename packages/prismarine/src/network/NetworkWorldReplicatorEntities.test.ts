import BinaryStream from '@jsprismarine/binaryutils';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub, stubOf } from '../testing/stub.test.helper';
import type { DataEntity } from '../entity/data/DataEntity';
import { StorePlayerActor, StorePlayers } from '../entity/data/storePlayers';
import { entityFixture, FLOOR_Y, TestEntityWorld } from '../entity/data/testing';
import { dataEntityRecordOf } from '../entity/data/persistence';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
import { enteredStorePlayer, SHIPPED_PLAYER } from '../testing/storePlayer.test.helper';
import type { StorePlayer } from '../entity/storePlayer';
import type { ShownActor, ShownEntity } from '../world/ShownActor';
import type { World } from '../world/World';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm, WindowIds } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import { MobEquipmentPacket } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import { Position } from '../world/Position';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import { replicateEntities } from '../testing/changeTicks.test.helper';
import { sealOccurrences } from '../testing/occurrences.test.helper';

/**
 * Who is shown what, as entities come and go.
 *
 * This used to live in `World.addEntity` and `World.removeEntity`, reaching through every
 * player into their session. Moving it here left it with no test at all, and the parts that
 * are easy to get subtly wrong - the arrival not being offered itself, a departure being told
 * about its own departure - are exactly the ones that were fixed once already.
 */
const fakeSession = (
    runtimeId: bigint,
    codec: ProtocolCodec = Codec2193,
    compressionAlgorithm: PacketCompressionAlgorithm = PacketCompressionAlgorithm.ZLIB,
    compressionThreshold = 256
) => {
    const considered: bigint[] = [];
    const dropped: bigint[] = [];
    const reconciled: bigint[][] = [];
    const sent: NetworkPacket[] = [];
    const frames: Buffer[] = [];
    const selfStateCalls: string[] = [];
    const tracked = new Set<bigint>();
    /** The batches handed over while they still compressed, which a test can wait for. */
    const pending: Promise<unknown>[] = [];
    /** What reached the session, frames and drops, in the order they did. */
    const order: ('frame' | 'drop')[] = [];

    return {
        order,
        pending,
        considered,
        dropped,
        reconciled,
        sent,
        frames,
        selfStateCalls,
        tracked,
        session: stub<PlayerSession>({
            runtimeId,
            getConnection: () =>
                stub<ClientConnection>({
                    codec,
                    compressionAlgorithm,
                    compressionThreshold,
                    sendSharedBatch: async (content) => {
                        frames.push(content);
                        order.push('frame');
                    },
                    sendSharedBatchAsync: (batch) => {
                        pending.push(batch);
                        return batch.then(({ content }) => void frames.push(content));
                    }
                }),
            sendMetadataFor: async () => void selfStateCalls.push('metadata'),
            sendStatusEffect: async () => void selfStateCalls.push('status effect'),
            // What `PlayerSession.considerEntity` does once the tracker says yes.
            considerEntity: async function (this: PlayerSession, entity: ShownEntity) {
                considered.push(entity.getRuntimeId());
                await entity.spawnTo(this);
                tracked.add(entity.getRuntimeId());
            },
            dropEntity: async (entity: Pick<ShownActor, 'getRuntimeId'>) => {
                dropped.push(entity.getRuntimeId());
                order.push('drop');
            },
            reconcileTrackedEntities: async (entities: Iterable<ShownEntity> = []) =>
                void reconciled.push([...entities].map((one) => one.getRuntimeId())),
            send: async (packet: NetworkPacket) => void sent.push(packet),
            tracks: (runtimeId: bigint) => tracked.has(runtimeId)
        })
    };
};

/** A player's session, whose actor is the player-controlled entity its world finds by its entity id. */
const fakePlayer = (
    runtimeId: bigint,
    codec?: ProtocolCodec,
    compressionAlgorithm?: PacketCompressionAlgorithm,
    compressionThreshold?: number
) => {
    const spy = fakeSession(runtimeId, codec, compressionAlgorithm, compressionThreshold);
    const actor = stubOf(StorePlayerActor, {
        getRuntimeId: () => runtimeId,
        getType: () => PLAYER_IDENTIFIER,
        getPosition: () => new Position(1, 64, 1, stub<World>()),
        isOnGround: () => false,
        getSyncedProperties: () => new SyncedProperties(),
        getEquipment: () => ({})
    });
    // Own properties, which shadow the prototype's accessors of these names.
    Object.defineProperties(actor, {
        pitch: { value: 0 },
        yaw: { value: 0 },
        headYaw: { value: 0 },
        metadata: { value: new Metadata(false) }
    });
    const player = Object.assign(spy.session, { getActor: () => actor, isConnected: () => true });

    return { player, spy };
};

/** A mob: in the world, but nobody's client. */
const fakeMob = (runtimeId: bigint) => {
    const world = stub<World>();
    return stub<ShownActor>({
        getRuntimeId: () => runtimeId,
        getPosition: () => new Position(1, 64, 1, world),
        pitch: 0,
        yaw: 0,
        headYaw: 0,
        isOnGround: () => false
    });
};

const replicatorOver = ({
    players = [],
    proximity = true,
    fullFlushFragments = false
}: {
    players?: PlayerSession[];
    proximity?: boolean;
    fullFlushFragments?: boolean;
} = {}) => {
    const world = stub<World>({
        getName: () => 'test',
        getViewers: () => players,
        viewerOf: (runtimeId) => players.find((player) => player.runtimeId === runtimeId)
    });

    const server = stub<Server>({
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => proximity,
                getPacketCompressionLevel: () => 1,
                getPacketCompressionThreshold: () => 256,
                getPacketFullFlushFragments: () => fullFlushFragments
            }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} })
    });

    return new NetworkWorldReplicator(world, server);
};

/** An entity type that carries what a client is shown: health a group raises, a name tag and equipment. */
const EXTRA = {
    'jsprismarine:shown': {
        description: { identifier: 'jsprismarine:shown', is_spawnable: true, is_summonable: true },
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:movement': { value: 0.25 },
            'minecraft:collision_box': { width: 0.6, height: 0.6 }
        },
        component_groups: { grown: { 'minecraft:health': { value: 30, max: 30 } } },
        events: { grow: { add: { component_groups: ['grown'] } } }
    }
};

/**
 * A replicator fed the sealed ticks of a real entity store, as a world feeds it, over sessions
 * that stand where the store's entities are.
 */
const replicatorOverLog = (players: PlayerSession[]) => {
    const { runtime, content } = entityFixture(
        new TestEntityWorld(),
        {},
        { ...EXTRA, [PLAYER_IDENTIFIER]: SHIPPED_PLAYER }
    );
    const world = stub<World>({
        getName: () => 'test',
        getViewers: () => players,
        viewerOf: (runtimeId) => players.find((player) => player.runtimeId === runtimeId)
    });
    const server = stub<Server>({
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => true,
                getPacketCompressionLevel: () => 1,
                getPacketCompressionThreshold: () => 256,
                getPacketFullFlushFragments: () => false
            }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} }),
        getContent: () => content,
        getStorePlayers: () => new StorePlayers()
    });
    const replicator = new NetworkWorldReplicator(world, server);
    /** One tick of the store around `work`, sealed into the replicator and flushed. */
    const tick = async (work: () => void) => {
        runtime.store.beginTick();
        work();
        const sealed = runtime.store.sealTick();
        if (sealed === undefined) throw new Error('the tick did not seal');
        replicator.tickSealed(sealed);
        await replicateEntities(replicator);
        await replicator.flushMovement();
    };
    const spawn = (at = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 }) => {
        const entity = runtime.spawn('jsprismarine:shown', at);
        if (entity === undefined) throw new Error('the fixture declares jsprismarine:shown');
        return entity;
    };
    return { runtime, replicator, tick, spawn };
};

/** Packet names by their wire id at protocol 2193. */
const NAMES = new Map(Object.entries(Codec2193.ids).map(([name, id]) => [id, name]));

/** The packets of every frame a session was handed, each by name with its bytes. */
const packetsIn = (frames: readonly Buffer[]): { readonly name: string | undefined; readonly buffer: Buffer }[] => {
    const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
    return frames
        .flatMap((frame) => decoder.decode(frame))
        .map((buffer) => ({ name: NAMES.get(new BinaryStream(buffer).readUnsignedVarInt() & 0x3ff), buffer }));
};
describe('network', () => {
    describe('NetworkWorldReplicator entities', () => {
        describe('an entity entering or leaving', () => {
            it('offers an entity that entered to everyone already here', async () => {
                const first = fakePlayer(1001n);
                const second = fakePlayer(1002n);
                const { tick, spawn } = replicatorOverLog([first.player, second.player]);

                let id = 0n;
                await tick(() => (id = BigInt(spawn().id)));

                expect(first.spy.considered).toStrictEqual([id]);
                expect(second.spy.considered).toStrictEqual([id]);
                // A mob has no client, so nothing is shown the world on its behalf.
                expect(first.spy.reconciled).toStrictEqual([]);
            });

            it('shows an arriving player everything already here, and shows it to everyone but itself', async () => {
                const resident = fakePlayer(1001n);
                const players = [resident.player];
                const { runtime, tick, spawn } = replicatorOverLog(players);
                let mob = 0n;
                await tick(() => (mob = BigInt(spawn().id)));
                const id = runtime.nextEntityId();
                const arriving = fakePlayer(BigInt(id));
                players.push(arriving.player);

                await tick(() => runtime.spawnPlayer(id, { x: 1.5, y: FLOOR_Y + 1, z: 0.5 }));

                expect(arriving.spy.reconciled).toStrictEqual([[mob, BigInt(id)]]);
                expect(arriving.spy.considered).toStrictEqual([]);
                expect(resident.spy.considered).toStrictEqual([mob, BigInt(id)]);
            });

            it('shows the entities after one whose first sight cannot be built, and replicates on', async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let first = 0n;
                let second = 0n;
                // What a first sight too large to share does: it throws while the flush runs.
                const consider = watching.player.considerEntity.bind(watching.player);
                watching.player.considerEntity = (entity) => {
                    if (entity.getRuntimeId() === first) throw new Error('too large to share');
                    return consider(entity);
                };

                await tick(() => {
                    first = BigInt(spawn().id);
                    second = BigInt(spawn({ x: 2.5, y: FLOOR_Y + 1, z: 0.5 }).id);
                });

                expect(watching.spy.considered).toStrictEqual([second]);
            });

            it('tells every client to forget an entity that left', async () => {
                // Every client, tracking or not: a stale id left behind would block that entity
                // from ever being tracked again.
                const first = fakePlayer(1001n);
                const second = fakePlayer(1002n);
                const { runtime, tick, spawn } = replicatorOverLog([first.player, second.player]);
                let id = 0;
                await tick(() => (id = spawn().id));

                await tick(() => runtime.remove(id, 'test'));

                expect(first.spy.dropped).toStrictEqual([BigInt(id)]);
                expect(second.spy.dropped).toStrictEqual([BigInt(id)]);
            });

            it('takes an entity removed between ticks off the clients with the next tick', async () => {
                // A console command runs between ticks, so `/summon` and `/kill` both do.
                const watching = fakePlayer(1001n);
                const { runtime, tick, spawn } = replicatorOverLog([watching.player]);
                const id = spawn().id;
                await tick(() => {});
                expect(watching.spy.considered).toStrictEqual([BigInt(id)]);

                runtime.remove(id, 'killed');
                await tick(() => {});

                expect(watching.spy.dropped).toStrictEqual([BigInt(id)]);
            });

            it('sends what happened to an entity in the tick it left before taking it away', async () => {
                // A killing blow: the hurt flash and the removal are logged in one tick, and the
                // flash has to reach the client that still has the entity.
                const watching = fakePlayer(1001n);
                const { runtime, tick, spawn } = replicatorOverLog([watching.player]);
                let id = 0;
                await tick(() => (id = spawn().id));
                watching.spy.frames.length = 0;
                watching.spy.order.length = 0;

                await tick(() => {
                    runtime.store.occurred({
                        kind: 'occurrence',
                        occurrence: 'actor-event',
                        data: { entity: BigInt(id), event: ActorEvent.HURT_ANIMATION, data: 0 }
                    });
                    runtime.remove(id, 'killed');
                });

                expect(watching.spy.order).toStrictEqual(['frame', 'drop']);
                expect(packetsIn(watching.spy.frames).map(({ name }) => name)).toStrictEqual(['ActorEventPacket']);
                expect(watching.spy.dropped).toStrictEqual([BigInt(id)]);
            });

            it('encodes a first sight once for each codec and compression group, whatever the viewers', async () => {
                // Five viewers in three groups: three on one codec and compression, one on the
                // same codec with another compression, and one on another codec.
                const viewers = [
                    fakePlayer(1001n),
                    fakePlayer(1002n),
                    fakePlayer(1003n),
                    fakePlayer(1004n, Codec2193, PacketCompressionAlgorithm.SNAPPY, 1),
                    fakePlayer(1005n, Codec2225)
                ];
                const { replicator, tick, spawn } = replicatorOverLog(viewers.map(({ player }) => player));

                await tick(() => spawn());

                expect(replicator.entityReplicationCounts()).toMatchObject({ firstSightEncodes: 3, firstSights: 5 });
                const [first, second, third] = viewers;
                expect(second!.spy.frames).toStrictEqual(first!.spy.frames);
                expect(third!.spy.frames).toStrictEqual(first!.spy.frames);
                expect(packetsIn(first!.spy.frames).map(({ name }) => name)).toStrictEqual(['AddActorPacket']);
            });

            it('shows an entity that left and entered again in one tick as it entered the second time', async () => {
                const watching = fakePlayer(1001n);
                const { runtime, tick, spawn } = replicatorOverLog([watching.player]);

                await tick(() => {
                    const entity = spawn();
                    const record = dataEntityRecordOf(entity, runtime.poolOf(entity.id));
                    runtime.remove(entity.id, 'test');
                    runtime.restore(record, { x: 4.5, y: FLOOR_Y + 1, z: 0.5 }, entity.id);
                });

                const spawns = packetsIn(watching.spy.frames)
                    .filter(({ name }) => name === 'AddActorPacket')
                    .map(({ buffer }) => {
                        const packet = new AddActorPacket(buffer);
                        packet.codecProtocol = Codec2193.protocolVersion;
                        packet.decode();
                        return packet.position.getX();
                    });
                expect(spawns.at(-1)).toBe(4.5);
            });

            it('sends a first sight too large to compress on the thread through the queue it holds', async () => {
                const watching = fakePlayer(1001n);
                const { runtime, tick } = replicatorOverLog([watching.player]);

                await tick(
                    () =>
                        void runtime.spawn(
                            'jsprismarine:shown',
                            { x: 0.5, y: FLOOR_Y + 1, z: 0.5 },
                            { prepare: (entity) => (entity.body.nameTag = 'n'.repeat(70_000)) }
                        )
                );

                expect(watching.spy.pending).toHaveLength(1);
                await Promise.all(watching.spy.pending);
                expect(packetsIn(watching.spy.frames).map(({ name }) => name)).toContain('AddActorPacket');
            });
        });

        describe('what a tick wrote', () => {
            it('visits the entities a tick wrote, whatever number the world holds', async () => {
                const visited = async (held: number) => {
                    const { replicator, tick, spawn } = replicatorOverLog([fakePlayer(1001n).player]);
                    const entities: DataEntity[] = [];
                    await tick(() => {
                        for (let index = 0; index < held; index++)
                            entities.push(spawn({ x: index * 2 + 0.5, y: FLOOR_Y + 1, z: 0.5 }));
                    });
                    const before = replicator.entityReplicationCounts().visited;
                    await tick(() => {
                        for (const entity of entities.slice(0, 2)) entity.body.nameTag = 'written';
                    });
                    return replicator.entityReplicationCounts().visited - before;
                };

                expect(await visited(3)).toBe(2);
                expect(await visited(300)).toBe(2);
            });

            it("sends an entity's new metadata to the clients that have it and not to the rest", async () => {
                const watching = fakePlayer(1001n);
                const blind = fakePlayer(1002n);
                const { tick, spawn } = replicatorOverLog([watching.player, blind.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                blind.spy.tracked.clear();
                watching.spy.frames.length = 0;
                blind.spy.frames.length = 0;

                await tick(() => (entity!.body.nameTag = 'Named'));

                expect(packetsIn(watching.spy.frames).map(({ name }) => name)).toStrictEqual(['SetActorDataPacket']);
                expect(blind.spy.frames).toHaveLength(0);
            });

            it('sends nothing for a tick that wrote what no client is shown', async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                watching.spy.frames.length = 0;

                await tick(() => (entity!.body.loveTicks = 600));

                expect(watching.spy.frames).toHaveLength(0);
            });

            it("sends a mob's new equipment as its armor and its held item", async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                watching.spy.frames.length = 0;

                await tick(() => entity!.body.setEquipment({ mainhand: { identifier: 'minecraft:stick', count: 1 } }));

                expect(packetsIn(watching.spy.frames).map(({ name }) => name)).toStrictEqual([
                    'MobArmorEquipmentPacket',
                    'MobEquipmentPacket'
                ]);
            });

            it('sends the maximum health a group raised, not the one the entity spawned with (#2995)', async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                watching.spy.frames.length = 0;

                await tick(() => {
                    entity!.instance.raise('grow', 'self', 'test');
                    entity!.instance.applyQueuedEvents();
                });

                const updates = packetsIn(watching.spy.frames).filter(({ name }) => name === 'UpdateAttributesPacket');
                expect(updates).toHaveLength(1);
                const packet = new UpdateAttributesPacket(updates[0]!.buffer);
                packet.codecProtocol = Codec2193.protocolVersion;
                packet.decode();
                expect(packet.attributes.map((attribute) => [attribute.getName(), attribute.getMax()])).toStrictEqual([
                    ['minecraft:health', 30]
                ]);
            });

            it('queues a move from the position a tick wrote, and snaps it after a teleport', async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                watching.spy.frames.length = 0;

                await tick(() => (entity!.body.position = { x: 2.5, y: FLOOR_Y + 1, z: 0.5 }));
                await tick(() => entity!.body.teleportTo({ x: 6.5, y: FLOOR_Y + 1, z: 0.5 }));

                const moves = packetsIn(watching.spy.frames)
                    .filter(({ name }) => name === 'MoveActorAbsolutePacket')
                    .map(({ buffer }) => {
                        const packet = new MoveActorAbsolutePacket(buffer);
                        packet.codecProtocol = Codec2193.protocolVersion;
                        packet.decode();
                        return [packet.position.getX(), (packet.flags & MoveActorAbsolutePacket.FLAG_TELEPORT) !== 0];
                    });
                expect(moves).toStrictEqual([
                    [2.5, false],
                    [6.5, true]
                ]);
            });

            it('tells the viewers an off hand that was emptied holds air', async () => {
                const watching = fakePlayer(1001n);
                const { tick, spawn } = replicatorOverLog([watching.player]);
                let entity: DataEntity | undefined;
                await tick(() => (entity = spawn()));
                await tick(() => entity!.body.setEquipment({ offhand: { identifier: 'minecraft:shield', count: 1 } }));
                watching.spy.frames.length = 0;

                await tick(() => entity!.body.setEquipment({}));

                const offhands = packetsIn(watching.spy.frames)
                    .filter(({ name }) => name === 'MobEquipmentPacket')
                    .map(({ buffer }) => {
                        const packet = new MobEquipmentPacket(buffer);
                        packet.codecProtocol = Codec2193.protocolVersion;
                        packet.decode();
                        return packet.getPacketData();
                    })
                    .filter((data) => data?.windowId === WindowIds.OFFHAND);
                expect(offhands).toHaveLength(1);
            });

            it("queues a move for a player who turns only the head, with the head's yaw", async () => {
                const watching = fakePlayer(1001n);
                const { runtime, tick } = replicatorOverLog([watching.player]);
                let player: StorePlayer | undefined;
                await tick(() => (player = enteredStorePlayer({ runtime }).player));
                watching.spy.frames.length = 0;

                await tick(() => (player!.headYaw = 45));
                await tick(() => (player!.headYaw = 45));

                const moves = packetsIn(watching.spy.frames)
                    .filter(({ name }) => name === 'MoveActorAbsolutePacket')
                    .map(({ buffer }) => {
                        const packet = new MoveActorAbsolutePacket(buffer);
                        packet.codecProtocol = Codec2193.protocolVersion;
                        packet.decode();
                        return [packet.yaw, packet.headYaw];
                    });
                expect(moves).toStrictEqual([[0, 45]]);
            });
        });

        describe('entityMoved', () => {
            it('sends only to the clients that have the entity', async () => {
                // A move for a runtime id a client was never sent a spawn for is discarded at
                // the other end, so tracking is both the correct gate and the cheaper one.
                const watching = fakePlayer(1n);
                const blind = fakePlayer(2n);
                const mob = fakeMob(3n);

                watching.spy.tracked.add(3n);

                const replicator = replicatorOver({ players: [watching.player, blind.player] });
                replicator.entityMoved(mob);
                await replicator.flushMovement();

                expect(watching.spy.frames).toHaveLength(1);
                expect(blind.spy.frames).toHaveLength(0);
            });

            it("does not send a player's movement back to that player's own session", async () => {
                const moving = fakePlayer(1n);
                const observer = fakePlayer(2n);
                moving.spy.tracked.add(1n);
                observer.spy.tracked.add(1n);

                const replicator = replicatorOver({ players: [moving.player, observer.player] });
                replicator.entityMoved(moving.player.getActor()!);
                await replicator.flushMovement();

                expect(moving.spy.frames).toHaveLength(0);
                expect(observer.spy.frames).toHaveLength(1);
            });

            it('keeps a teleport flag when later moves replace the pose before flush', async () => {
                const watcher = fakePlayer(1n);
                const mob = fakeMob(3n);
                watcher.spy.tracked.add(3n);
                const replicator = replicatorOver({ players: [watcher.player] });

                replicator.entityMoved(mob, true);
                replicator.entityMoved(mob);
                await replicator.flushMovement();

                expect(watcher.spy.frames).toHaveLength(1);
                const [payload] = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(
                    watcher.spy.frames[0]!
                );
                const packet = new MoveActorAbsolutePacket(payload);
                packet.decode();
                expect(packet.flags & MoveActorAbsolutePacket.FLAG_TELEPORT).not.toBe(0);
            });
        });

        it('frames the same movement with each viewer’s negotiated compression algorithm', async () => {
            const snappy = fakePlayer(1n, Codec2193, PacketCompressionAlgorithm.SNAPPY, 1);
            const uncompressed = fakePlayer(2n, Codec2193, PacketCompressionAlgorithm.NONE, 0);
            const mob = fakeMob(3n);
            snappy.spy.tracked.add(3n);
            uncompressed.spy.tracked.add(3n);
            const replicator = replicatorOver({ players: [snappy.player, uncompressed.player] });

            replicator.entityMoved(mob);
            await replicator.flushMovement();

            expect(snappy.spy.frames[0]![1]).toBe(PacketCompressionAlgorithm.SNAPPY);
            expect(uncompressed.spy.frames[0]![1]).toBe(0xff);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(snappy.spy.frames[0]!)
            ).toHaveLength(1);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(
                    uncompressed.spy.frames[0]!
                )
            ).toHaveLength(1);
        });

        it('encodes a moved entity once per codec and shares its batch among tracking viewers', async () => {
            const encodesByCodec = { codec2193: 0, codec2225: 0 };
            const codec2193: ProtocolCodec = {
                ...Codec2193,
                prepareOutbound: (packet) => {
                    encodesByCodec.codec2193++;
                    return Codec2193.prepareOutbound(packet);
                }
            };
            const codec2225: ProtocolCodec = {
                ...Codec2225,
                prepareOutbound: (packet) => {
                    encodesByCodec.codec2225++;
                    return Codec2225.prepareOutbound(packet);
                }
            };
            const first = fakePlayer(1n, codec2193);
            const second = fakePlayer(2n, codec2193);
            const newerClient = fakePlayer(4n, codec2225);
            const mob = fakeMob(3n);
            first.spy.tracked.add(3n);
            second.spy.tracked.add(3n);
            newerClient.spy.tracked.add(3n);
            const replicator = replicatorOver({ players: [first.player, second.player, newerClient.player] });

            replicator.entityMoved(mob);
            await replicator.flushMovement();

            expect(encodesByCodec).toStrictEqual({ codec2193: 1, codec2225: 1 });
            expect(first.spy.frames).toHaveLength(1);
            expect(second.spy.frames).toStrictEqual(first.spy.frames);
            expect(newerClient.spy.frames).toHaveLength(1);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 }).decode(
                    first.spy.frames[0]!
                )
            ).toHaveLength(1);
        });

        it('reuses opted-in movement fragments across tracking viewers', async () => {
            const first = fakePlayer(1n);
            const second = fakePlayer(2n);
            const mobs = Array.from({ length: 20 }, (_unused, index) => fakeMob(BigInt(index + 10)));
            for (const mob of mobs) {
                first.spy.tracked.add(mob.getRuntimeId());
                second.spy.tracked.add(mob.getRuntimeId());
            }
            const replicator = replicatorOver({ players: [first.player, second.player], fullFlushFragments: true });
            const encodeFragment = vi.spyOn(BatchCodec.prototype, 'encodeFullFlushFragment');
            try {
                for (const mob of mobs) replicator.entityMoved(mob);
                await replicator.flushMovement();

                expect(encodeFragment).toHaveBeenCalledTimes(mobs.length);
                const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
                expect(decoder.decode(first.spy.frames[0]!)).toHaveLength(mobs.length);
                expect(second.spy.frames).toStrictEqual(first.spy.frames);
            } finally {
                vi.restoreAllMocks();
            }
        });

        it('shares a status effect among the clients tracking the actor', async () => {
            let encodes = 0;
            const codec: ProtocolCodec = {
                ...Codec2193,
                prepareOutbound: (packet) => {
                    encodes++;
                    return Codec2193.prepareOutbound(packet);
                }
            };
            const first = fakePlayer(1n, codec);
            const second = fakePlayer(2n, codec);
            const mob = stub<ShownActor>({ getRuntimeId: () => 3n });
            first.spy.tracked.add(3n);
            second.spy.tracked.add(3n);
            const replicator = replicatorOver({ players: [first.player, second.player] });
            const effect = {
                id: 'minecraft:speed',
                amplifier: 0,
                durationTicks: 100,
                ambient: false,
                showParticles: true,
                showIcon: true
            };

            sealOccurrences(replicator, {
                kind: 'occurrence',
                occurrence: 'status-effect',
                data: { entity: mob.getRuntimeId(), change: 'add', effect }
            });
            await replicator.flushOccurrences();

            expect(encodes).toBe(1);
            expect(first.spy.frames).toHaveLength(1);
            expect(second.spy.frames).toStrictEqual(first.spy.frames);
            expect(first.spy.sent).toHaveLength(0);
        });

        describe('flushMovement', () => {
            it('does no work when no entity moved', async () => {
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.flushMovement();

                expect(first.spy.frames).toHaveLength(0);
                expect(second.spy.frames).toHaveLength(0);
            });
        });
    });
});
