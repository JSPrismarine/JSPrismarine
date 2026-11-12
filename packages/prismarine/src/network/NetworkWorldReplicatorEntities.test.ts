import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub, stubOf } from '../testing/stub.test.helper';
import { StorePlayerActor } from '../entity/data/storePlayers';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
import type { ShownActor } from '../world/ShownActor';
import type { World } from '../world/World';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import { Position } from '../world/Position';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

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

    return {
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
                    sendSharedBatch: async (content) => void frames.push(content),
                    sendSharedBatchAsync: async (batch) => void frames.push((await batch).content)
                }),
            sendAttributesFor: async () => void selfStateCalls.push('attributes'),
            sendMetadataFor: async () => void selfStateCalls.push('metadata'),
            sendStatusEffect: async () => void selfStateCalls.push('status effect'),
            sendEquipmentFor: async () => void selfStateCalls.push('equipment'),
            considerEntity: async (entity: ShownActor) => void considered.push(entity.getRuntimeId()),
            dropEntity: async (entity: ShownActor) => void dropped.push(entity.getRuntimeId()),
            reconcileTrackedEntities: async (entities: Iterable<ShownActor> = []) =>
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
    entities = [],
    proximity = true,
    fullFlushFragments = false
}: {
    players?: PlayerSession[];
    entities?: ShownActor[];
    proximity?: boolean;
    fullFlushFragments?: boolean;
} = {}) => {
    const world = stub<World>({
        getName: () => 'test',
        getViewers: () => players,
        viewerOf: (runtimeId) => players.find((player) => player.runtimeId === runtimeId),
        shownActors: () => entities
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
describe('network', () => {
    describe('NetworkWorldReplicator entities', () => {
        describe('entityAdded', () => {
            it('shows an arriving player everything already here', async () => {
                const { player, spy } = fakePlayer(1n);
                const mob = fakeMob(2n);
                const replicator = replicatorOver({ players: [player], entities: [mob] });

                await replicator.entityAdded(player.getActor()!);

                expect(spy.reconciled).toStrictEqual([[2n]]);
            });

            it('does not offer an arriving player to itself', async () => {
                // A client is never sent a spawn for the entity it is controlling.
                const { player, spy } = fakePlayer(1n);
                const replicator = replicatorOver({ players: [player], entities: [player.getActor()!] });

                await replicator.entityAdded(player.getActor()!);

                expect(spy.considered).toStrictEqual([]);
            });

            it('offers an arriving mob to everyone already here', async () => {
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const mob = fakeMob(3n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.entityAdded(mob);

                expect(first.spy.considered).toStrictEqual([3n]);
                expect(second.spy.considered).toStrictEqual([3n]);
                // A mob has no client, so nothing is shown the world on its behalf.
                expect(first.spy.reconciled).toStrictEqual([]);
            });

            it('shows an arriving player to the players already here', async () => {
                // The bug this replaced: an arriving player was shown the world, but the world
                // was never shown them.
                const resident = fakePlayer(1n);
                const arriving = fakePlayer(2n);
                const replicator = replicatorOver({ players: [resident.player, arriving.player] });

                await replicator.entityAdded(arriving.player.getActor()!);

                expect(resident.spy.considered).toStrictEqual([2n]);
            });
        });

        describe('entityRemoved', () => {
            it('tells every client to forget it', async () => {
                // Every client, tracking or not: a stale id left behind would block that entity
                // from ever being tracked again.
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const mob = fakeMob(3n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.entityRemoved(mob);

                expect(first.spy.dropped).toStrictEqual([3n]);
                expect(second.spy.dropped).toStrictEqual([3n]);
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

        it('shares entity-state packets while retaining the per-session path for an entity player', async () => {
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
            const mob = stub<ShownActor>({
                getRuntimeId: () => 3n,
                metadata: new Metadata(false),
                getSyncedProperties: () => new SyncedProperties(),
                getEquipment: () => ({})
            });
            first.spy.tracked.add(3n);
            second.spy.tracked.add(3n);
            const replicator = replicatorOver({ players: [first.player, second.player] });
            const attribute = new Attribute({ name: 'minecraft:health', min: 0, max: 20, def: 20, value: 15 });
            const effect = {
                id: 'minecraft:speed',
                amplifier: 0,
                durationTicks: 100,
                ambient: false,
                showParticles: true,
                showIcon: true
            };

            await replicator.actorEffect(mob, ActorEvent.HURT_ANIMATION, 0);
            await replicator.entityAttributesChanged(mob, [attribute]);
            await replicator.statusEffectChanged(mob, effect, 'add');
            await replicator.entityMetadataChanged(mob);
            await replicator.entityEquipmentChanged(mob);

            expect(encodes).toBe(6);
            expect(first.spy.frames).toHaveLength(5);
            expect(second.spy.frames).toStrictEqual(first.spy.frames);
            expect(first.spy.sent).toHaveLength(0);
        });

        it('routes the player state changes but its equipment through its own input-tick-aware session methods', async () => {
            const { player, spy } = fakePlayer(1n);
            const replicator = replicatorOver({ players: [player] });
            const attribute = new Attribute({ name: 'minecraft:health', min: 0, max: 20, def: 20, value: 15 });
            const effect = {
                id: 'minecraft:speed',
                amplifier: 0,
                durationTicks: 100,
                ambient: false,
                showParticles: true,
                showIcon: true
            };

            await replicator.entityAttributesChanged(player.getActor()!, [attribute]);
            await replicator.statusEffectChanged(player.getActor()!, effect, 'add');
            await replicator.entityMetadataChanged(player.getActor()!);
            await replicator.entityEquipmentChanged(player.getActor()!);

            // No equipment: the client keeps its own inventory, and a held item named at hotbar slot
            // zero would move its selection there.
            expect(spy.selfStateCalls).toStrictEqual(['attributes', 'status effect', 'metadata']);
            expect(spy.frames).toHaveLength(0);
        });

        describe('entityMetadataChanged', () => {
            it("sends an actor's state to its observers and not to the client whose entity it is", async () => {
                // A player in the entity store is shown through an actor, not through its
                // session's player object, so the client is recognized by the shared runtime id.
                const own = fakePlayer(1n);
                const observer = fakePlayer(2n);
                own.spy.tracked.add(1n);
                observer.spy.tracked.add(1n);
                const actor = stub<ShownActor>({
                    getRuntimeId: () => 1n,
                    metadata: new Metadata(),
                    getSyncedProperties: () => new SyncedProperties()
                });

                const replicator = replicatorOver({ players: [own.player, observer.player] });
                await replicator.entityMetadataChanged(actor);

                expect(own.spy.frames).toHaveLength(0);
                expect(observer.spy.frames).toHaveLength(1);
            });
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
