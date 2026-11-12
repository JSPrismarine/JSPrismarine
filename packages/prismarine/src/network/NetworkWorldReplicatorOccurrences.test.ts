import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { ActorEvent, LevelEvent, LevelSoundEvent, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import { BatchCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ActorEventPacket from '@jsprismarine/protocol/packet/ActorEventPacket';
import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import LevelEventPacket from '@jsprismarine/protocol/packet/LevelEventPacket';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import SpawnParticleEffectPacket from '@jsprismarine/protocol/packet/SpawnParticleEffectPacket';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { inputContext } from '../testing/handlerContext.test.helper';
import { sealOccurrences } from '../testing/occurrences.test.helper';
import type { OccurrenceEntry } from '../world/changelog/ChangeEntry';
import { stubPlayerPort } from '../testing/playerPort.test.helper';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/DimensionType';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type ClientConnection from './ClientConnection';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import LevelSoundEventHandler from './handler/LevelSoundEventHandler';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import type PlayerSession from './PlayerSession';

/**
 * The occurrences of a sealed tick, sent after it: who receives each, and how many times it is
 * encoded for them.
 */

/** A codec that counts the packets it prepares, which is one for each packet of each encode. */
const counting = (codec: ProtocolCodec) => {
    const counter = { encodes: 0 };
    const counted: ProtocolCodec = {
        ...codec,
        prepareOutbound: (packet) => {
            counter.encodes++;
            return codec.prepareOutbound(packet);
        }
    };
    return { codec: counted, counter };
};

/** A viewer at the origin, recording the packets sent to it alone and the shared frames. */
const viewer = (
    runtimeId: bigint,
    {
        codec = Codec2193,
        compressionAlgorithm = PacketCompressionAlgorithm.ZLIB,
        compressionThreshold = 256,
        tracked = []
    }: {
        codec?: ProtocolCodec;
        compressionAlgorithm?: PacketCompressionAlgorithm;
        compressionThreshold?: number;
        tracked?: bigint[];
    } = {}
) => {
    const sent: NetworkPacket[] = [];
    const frames: Buffer[] = [];
    const motions: Vector3[] = [];
    const session = stub<PlayerSession>({
        sendMotion: async (motion: Vector3) => void motions.push(motion),
        runtimeId,
        isConnected: () => true,
        getViewPosition: () => new Position(0, 64, 0, stub<World>()),
        getViewDistance: () => 10,
        getConnection: () =>
            stub<ClientConnection>({
                codec,
                compressionAlgorithm,
                compressionThreshold,
                sendSharedBatch: async (content) => void frames.push(content),
                sendSharedBatchAsync: async (batch) => void frames.push((await batch).content)
            }),
        send: async (packet: NetworkPacket) => void sent.push(packet),
        tracks: (id: bigint) => tracked.includes(id)
    });
    return { session, sent, frames, motions };
};

const replicatorOver = (viewers: PlayerSession[]) => {
    const world = stub<World>({
        getName: () => 'test',
        getDimension: () => Dimensions.Nether,
        getViewers: () => viewers,
        viewerOf: (runtimeId) => viewers.find((session) => session.runtimeId === runtimeId)
    });
    const server = stub<Server>({
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => true,
                getPacketCompressionLevel: () => 1
            }),
        getLogger: () => stub<Logger>({ verbose: () => {}, error: () => {} })
    });
    return new NetworkWorldReplicator(world, server);
};

describe('network', () => {
    describe('NetworkWorldReplicator occurrences', () => {
        /** One broadcast occurrence of each kind, all near the viewers and about an entity they all track. */
        const broadcasts: readonly OccurrenceEntry[] = [
            {
                kind: 'occurrence',
                occurrence: 'world-effect',
                data: { position: { x: 1, y: 64, z: 1 }, effect: LevelEvent.PARTICLES_CRIT, data: 0 }
            },
            {
                kind: 'occurrence',
                occurrence: 'block-sound',
                data: { x: 1, y: 64, z: 1, sound: LevelSoundEvent.HIT, block: 1, except: null }
            },
            {
                kind: 'occurrence',
                occurrence: 'named-sound',
                data: { x: 1, y: 64, z: 1, name: 'random.chestopen', volume: 1, pitch: 1 }
            },
            {
                kind: 'occurrence',
                occurrence: 'named-particle',
                data: { x: 1, y: 64, z: 1, name: 'minecraft:crop_growth_emitter' }
            },
            {
                kind: 'occurrence',
                occurrence: 'actor-sound',
                data: { entity: 99n, x: 1, y: 64, z: 1, sound: LevelSoundEvent.HURT, type: 'minecraft:cow' }
            },
            {
                kind: 'occurrence',
                occurrence: 'relayed-sound',
                data: {
                    sender: 99n,
                    x: 1,
                    y: 64,
                    z: 1,
                    sound: LevelSoundEvent.STEP,
                    data: -1,
                    type: 'minecraft:player',
                    baby: false,
                    global: false,
                    actor: 99n,
                    firedAt: null
                }
            },
            {
                kind: 'occurrence',
                occurrence: 'actor-event',
                data: { entity: 99n, event: ActorEvent.HURT_ANIMATION, data: 0 }
            },
            {
                kind: 'occurrence',
                occurrence: 'animate',
                data: { entity: 99n, action: 1, data: 0, swingSource: null }
            },
            {
                kind: 'occurrence',
                occurrence: 'emote',
                data: {
                    entity: 99n,
                    emote: '4c8ae710-df2e-47cd-814d-cc7bf21a3d67',
                    lengthTicks: 40,
                    xuid: '',
                    platformId: '',
                    flags: EmoteFlags.ServerSide
                }
            },
            {
                kind: 'occurrence',
                occurrence: 'status-effect',
                data: {
                    entity: 99n,
                    change: 'add',
                    effect: {
                        id: 'minecraft:speed',
                        amplifier: 0,
                        durationTicks: 100,
                        ambient: false,
                        showParticles: true,
                        showIcon: true
                    }
                }
            }
        ];

        it.each(broadcasts.map((entry) => [entry.occurrence, entry] as const))(
            'encodes one %s once for each codec and compression group of its audience',
            async (_kind, entry) => {
                // Six viewers in three groups: two protocol versions, and one viewer on the first
                // version that negotiated another compression.
                const older = counting(Codec2193);
                const newer = counting(Codec2225);
                const tracked = [99n];
                const viewers = [
                    viewer(1n, { codec: older.codec, tracked }),
                    viewer(2n, { codec: older.codec, tracked }),
                    viewer(3n, { codec: older.codec, tracked }),
                    viewer(4n, { codec: newer.codec, tracked }),
                    viewer(5n, { codec: newer.codec, tracked }),
                    viewer(6n, { codec: older.codec, compressionAlgorithm: PacketCompressionAlgorithm.NONE, tracked })
                ];
                const replicator = replicatorOver(viewers.map(({ session }) => session));

                sealOccurrences(replicator, entry);
                await replicator.flushOccurrences();

                expect(older.counter.encodes + newer.counter.encodes).toBe(3);
                expect(older.counter.encodes).toBe(2);
                for (const { frames, sent } of viewers) {
                    expect(frames).toHaveLength(1);
                    expect(sent).toHaveLength(0);
                }
                expect(viewers[1]!.frames).toStrictEqual(viewers[0]!.frames);
                expect(viewers[3]!.frames).toStrictEqual(viewers[4]!.frames);
            }
        );

        it('sends nothing until the flush, and each occurrence once', async () => {
            const one = viewer(1n);
            const replicator = replicatorOver([one.session]);

            sealOccurrences(replicator, {
                kind: 'occurrence',
                occurrence: 'world-effect',
                data: { position: null, effect: LevelEvent.START_RAINING, data: 100 }
            });
            expect(one.sent).toHaveLength(0);

            await replicator.flushOccurrences();
            await replicator.flushOccurrences();

            expect(one.sent).toHaveLength(1);
            const packet = one.sent[0];
            if (!(packet instanceof LevelEventPacket)) throw new Error('expected a level event');
            expect(packet.getPacketData()?.position).toBeNull();
        });

        describe('world-effect', () => {
            it('reaches the players near it, and every player for the whole world', async () => {
                const near = viewer(1n);
                const replicator = replicatorOver([near.session]);

                sealOccurrences(
                    replicator,
                    {
                        kind: 'occurrence',
                        occurrence: 'world-effect',
                        data: { position: { x: 4000, y: 64, z: 0 }, effect: LevelEvent.PARTICLES_CRIT, data: 0 }
                    },
                    {
                        kind: 'occurrence',
                        occurrence: 'world-effect',
                        data: { position: null, effect: LevelEvent.STOP_RAINING, data: 0 }
                    }
                );
                await replicator.flushOccurrences();

                expect(
                    near.sent.map((packet) => packet instanceof LevelEventPacket && packet.getPacketData()?.eventId)
                ).toStrictEqual([LevelEvent.STOP_RAINING]);
            });
        });

        describe('named-particle', () => {
            it("names the world's dimension and the point it appears at", async () => {
                const near = viewer(1n);
                const replicator = replicatorOver([near.session]);

                sealOccurrences(replicator, {
                    kind: 'occurrence',
                    occurrence: 'named-particle',
                    data: { x: 1.5, y: 64.5, z: 2.5, name: 'minecraft:crop_growth_emitter' }
                });
                await replicator.flushOccurrences();

                const packet = near.sent[0];
                if (!(packet instanceof SpawnParticleEffectPacket)) throw new Error('expected a particle');
                expect(packet.dimensionId).toBe(Dimensions.Nether.bedrockId);
                expect(packet.effectName).toBe('minecraft:crop_growth_emitter');
                expect(packet.position.getX()).toBe(1.5);
            });
        });

        describe('actor-event', () => {
            it("reaches the players tracking the entity and the entity's own client, and nobody else", async () => {
                const own = viewer(1n);
                const tracking = viewer(2n, { tracked: [1n] });
                const elsewhere = viewer(3n);
                const replicator = replicatorOver([own.session, tracking.session, elsewhere.session]);

                sealOccurrences(replicator, {
                    kind: 'occurrence',
                    occurrence: 'actor-event',
                    data: { entity: 1n, event: ActorEvent.FEED, data: 7 }
                });
                await replicator.flushOccurrences();

                // The trackers share one encode; the entity's own client is sent its own packet.
                const packet = own.sent[0];
                if (!(packet instanceof ActorEventPacket)) throw new Error('expected an actor event');
                expect([packet.runtimeEntityId, packet.event, packet.data]).toStrictEqual([1n, ActorEvent.FEED, 7]);
                expect(tracking.frames).toHaveLength(1);
                expect(elsewhere.frames).toHaveLength(0);
                expect(elsewhere.sent).toHaveLength(0);
            });
        });

        describe('animate', () => {
            it('reaches the players tracking the animated player once each, and not the player', async () => {
                const own = viewer(1n, { tracked: [1n] });
                const tracking = viewer(2n, { tracked: [1n] });
                const elsewhere = viewer(3n);
                const replicator = replicatorOver([own.session, tracking.session, elsewhere.session]);

                sealOccurrences(replicator, {
                    kind: 'occurrence',
                    occurrence: 'animate',
                    data: { entity: 1n, action: 1, data: 2.5, swingSource: 'attack' }
                });
                await replicator.flushOccurrences();

                expect(tracking.frames).toHaveLength(1);
                expect(own.frames).toHaveLength(0);
                expect(own.sent).toHaveLength(0);
                expect(elsewhere.frames).toHaveLength(0);
            });
        });

        describe('impulse', () => {
            it("asks the client that owns the body's movement to take it, and nobody else", async () => {
                const owner = viewer(1n, { tracked: [1n] });
                const tracking = viewer(2n, { tracked: [1n] });
                const replicator = replicatorOver([owner.session, tracking.session]);

                sealOccurrences(replicator, {
                    kind: 'occurrence',
                    occurrence: 'impulse',
                    data: { entity: 1n, x: 0.4, y: 0.36, z: -0.2 }
                });
                expect(owner.motions).toHaveLength(0);
                await replicator.flushOccurrences();

                expect(owner.motions).toStrictEqual([new Vector3(0.4, 0.36, -0.2)]);
                expect(tracking.motions).toHaveLength(0);
                expect(tracking.frames).toHaveLength(0);
            });
        });

        describe('relayed-sound', () => {
            it("plays a client's sound to the players near it but the sender, with the bytes the client sent", async () => {
                // A step with a Fire At Position, from the client's own bytes, through the handler
                // and the log to the wire.
                const bytes = Buffer.concat([
                    Buffer.from([0x7b, 0x04]),
                    Buffer.from('step'),
                    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x42, 0x00, 0x00, 0x00, 0x00]), // 0, 64, 0
                    Buffer.from([0x01]), // Data -1
                    Buffer.from([0x10]),
                    Buffer.from('minecraft:player'),
                    Buffer.from([0x00, 0x00]), // Is Baby, Is Global
                    Buffer.from([0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Actor Unique Id, the sender
                    Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // Fire At Position
                ]);
                const incoming = new LevelSoundEventPacket(bytes);
                incoming.decode();
                const sender = viewer(7n);
                const near = viewer(8n);
                const replicator = replicatorOver([sender.session, near.session]);
                const world = stub<World>({
                    relaySound: (sound) =>
                        sealOccurrences(replicator, { kind: 'occurrence', occurrence: 'relayed-sound', data: sound })
                });
                const session = stub<PlayerSession>({
                    runtimeId: 7n,
                    identity: identityNamed('tester'),
                    getPlayer: () => stubPlayerPort({ getPosition: () => new Position(0, 64, 0, world) }),
                    getWorld: () => world
                });
                const { context } = inputContext(session, { log: stub<Logger>({ verbose: () => {} }) });

                new LevelSoundEventHandler().handle(incoming, context);
                await replicator.flushOccurrences();

                expect(sender.sent).toHaveLength(0);
                const relayed = near.sent[0];
                if (!(relayed instanceof LevelSoundEventPacket)) throw new Error('expected a sound');
                relayed.encode();
                expect(relayed.getBuffer()).toEqual(bytes);
            });
        });

        describe('emote', () => {
            it('reaches the players tracking the player as a packet encoded from its own fields', async () => {
                // Not the bytes the client sent: the account and the flag are the server's.
                const tracking = viewer(2n, { tracked: [1n] });
                const elsewhere = viewer(3n);
                const replicator = replicatorOver([tracking.session, elsewhere.session]);
                const data = {
                    entity: 1n,
                    emote: '4c8ae710-df2e-47cd-814d-cc7bf21a3d67',
                    lengthTicks: 40,
                    xuid: 'steve-xuid',
                    platformId: 'p',
                    flags: EmoteFlags.ServerSide
                };

                sealOccurrences(replicator, { kind: 'occurrence', occurrence: 'emote', data });
                await replicator.flushOccurrences();

                const expected = Object.assign(new EmotePacket(), {
                    actorRuntimeId: 1n,
                    emoteId: data.emote,
                    emoteLengthTicks: 40,
                    xuid: 'steve-xuid',
                    platformId: 'p',
                    flags: EmoteFlags.ServerSide
                });
                const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
                const [frame] = tracking.frames;
                if (frame === undefined) throw new Error('nothing relayed');
                expect(decoder.decode(frame)).toStrictEqual([expected.encodeTransient()]);
                expect(elsewhere.frames).toHaveLength(0);
            });
        });

        describe('actor-sound', () => {
            it('attributes a mob sound to the mob that made it, and a player sound to no type', async () => {
                // A player's client plays its own player sounds, and naming the player type
                // plays them twice.
                const near = viewer(1n);
                const replicator = replicatorOver([near.session]);

                sealOccurrences(
                    replicator,
                    {
                        kind: 'occurrence',
                        occurrence: 'actor-sound',
                        data: { entity: 2n, x: 1, y: 64, z: 1, sound: LevelSoundEvent.HURT, type: 'minecraft:zombie' }
                    },
                    {
                        kind: 'occurrence',
                        occurrence: 'actor-sound',
                        data: { entity: 1n, x: 1, y: 64, z: 1, sound: LevelSoundEvent.HURT, type: 'minecraft:player' }
                    }
                );
                await replicator.flushOccurrences();

                const sounds = near.sent.filter((packet) => packet instanceof LevelSoundEventPacket);
                expect(sounds.map((packet) => [packet.entityType, packet.entityUniqueId])).toStrictEqual([
                    ['minecraft:zombie', 2n],
                    ['', 1n]
                ]);
            });
        });

        describe('block-sound', () => {
            it('plays at the center of the block to everyone near but the player it names', async () => {
                // The one striking a block, whose client plays its own hits.
                const striker = viewer(1n);
                const neighbor = viewer(2n);
                const replicator = replicatorOver([striker.session, neighbor.session]);

                sealOccurrences(replicator, {
                    kind: 'occurrence',
                    occurrence: 'block-sound',
                    data: { x: 3, y: 64, z: 4, sound: LevelSoundEvent.HIT, block: 42, except: 1n }
                });
                await replicator.flushOccurrences();

                expect(striker.sent).toHaveLength(0);
                const packet = neighbor.sent[0];
                if (!(packet instanceof LevelSoundEventPacket)) throw new Error('expected a sound');
                expect([packet.positionX, packet.positionY, packet.positionZ]).toStrictEqual([3.5, 64.5, 4.5]);
                expect(packet.extraData).toBe(42);
            });
        });
    });
});
