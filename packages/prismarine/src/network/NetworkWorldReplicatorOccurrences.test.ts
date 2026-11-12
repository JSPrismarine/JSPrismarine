import type { Logger } from '@jsprismarine/logger';
import { LevelEvent, LevelSoundEvent, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import LevelEventPacket from '@jsprismarine/protocol/packet/LevelEventPacket';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import SpawnParticleEffectPacket from '@jsprismarine/protocol/packet/SpawnParticleEffectPacket';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { sealOccurrences } from '../testing/occurrences.test.helper';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/Dimension';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type ClientConnection from './ClientConnection';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
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
    const session = stub<PlayerSession>({
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
    return { session, sent, frames };
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
        it('encodes one broadcast occurrence once for each codec and compression group of its audience', async () => {
            // Six viewers in three groups: two protocol versions, and one viewer on the first
            // version that negotiated another compression.
            const older = counting(Codec2193);
            const newer = counting(Codec2225);
            const viewers = [
                viewer(1n, { codec: older.codec }),
                viewer(2n, { codec: older.codec }),
                viewer(3n, { codec: older.codec }),
                viewer(4n, { codec: newer.codec }),
                viewer(5n, { codec: newer.codec }),
                viewer(6n, { codec: older.codec, compressionAlgorithm: PacketCompressionAlgorithm.NONE })
            ];
            const replicator = replicatorOver(viewers.map(({ session }) => session));

            sealOccurrences(replicator, {
                kind: 'occurrence',
                occurrence: 'world-effect',
                data: { position: { x: 1, y: 64, z: 1 }, effect: LevelEvent.PARTICLES_CRIT, data: 0 }
            });
            await replicator.flushOccurrences();

            expect(older.counter.encodes + newer.counter.encodes).toBe(3);
            expect(older.counter.encodes).toBe(2);
            for (const { frames } of viewers) expect(frames).toHaveLength(1);
            expect(viewers[1]!.frames).toStrictEqual(viewers[0]!.frames);
        });

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
