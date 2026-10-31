import BinaryStream from '@jsprismarine/binaryutils';
import Codec2193 from '@jsprismarine/prismarine/network/codec/Codec2193';
import Codec2225 from '@jsprismarine/prismarine/network/codec/Codec2225';
import { registeredCodecs } from '@jsprismarine/prismarine/network/codec/CodecRegistry';
import type { Arrival } from '@jsprismarine/prismarine/network/PlayerSession';
import { fakePlayer } from '@jsprismarine/prismarine/testing/fakePlayer.test.helper';
import { stub } from '@jsprismarine/prismarine/testing/stub.test.helper';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import type { Entity } from '@jsprismarine/prismarine/entity/Entity';
import { Dimensions } from '@jsprismarine/prismarine/world/DimensionType';
import type { DimensionType } from '@jsprismarine/prismarine/world/DimensionType';
import { Position } from '@jsprismarine/prismarine/world/Position';
import type { World } from '@jsprismarine/prismarine/world/World';
import type { NetworkPacket, ProtocolCodec } from '@jsprismarine/protocol';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import type { DimensionDefinitionFields } from '@jsprismarine/protocol/wire/structures/DimensionDefinition';
import {
    readDimensionDefinition,
    writeDimensionDefinition
} from '@jsprismarine/protocol/wire/structures/DimensionDefinition';
import UUID from '@jsprismarine/protocol/structure/UUID';
import { beforeAll, describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { reportParityProgress } from './progress.ts';

/**
 * The portal note's `protocol.dimension-change` row: the packet sequence
 * `PlayerSession.changeWorld` sends a client, captured from a `fakePlayer()` run, encodes
 * through every registered codec and decodes back to the same data, and the
 * `DimensionDefinition` cloud fields travel at protocol 2225 only.
 *
 * `changeWorld` is the whole server side of a dimension change, so a packet it sends that one
 * codec cannot carry, or carries differently from how it reads, is a client of that version
 * stuck on the loading screen. The row asks each codec for the packet's wire id, encodes with
 * that codec's context, decodes the bytes through the same codec and re-encodes them, so a
 * layout that reads fewer bytes than it writes fails here rather than on a real client.
 */

/** A destination world of one dimension, whose chunks are empty and carry that dimension. */
const worldOf = (dimension: DimensionType): World =>
    stub<World>({
        getName: () => `${dimension.name} world`,
        getDimension: () => dimension,
        addEntity: async () => {},
        broadcastMove: async () => {},
        getPlayers: () => [],
        getSpawnPosition: async () => new Position(8, 70, 8, target()),
        getChunk: async (x, z) => new Chunk(x, z, new Map(), dimension)
    });

let destination: World | undefined;
const target = (): World => {
    destination ??= worldOf(Dimensions.Nether);
    return destination;
};

/**
 * Every packet `changeWorld` sends for an Overworld to Nether change, then the arrival chunk the
 * change queued, in the order the client receives them.
 */
const captureSequence = async (): Promise<NetworkPacket<unknown>[]> => {
    const { player, sent } = fakePlayer();
    const session = player.getNetworkSession();
    // A tracked mob in the world being left, so the change has an actor to remove.
    await session.considerEntity(
        stub<Entity>({
            getRuntimeId: () => player.getRuntimeId() + 1_000_000n,
            getPosition: () => new Position(4, 64, 4, player.getWorld()),
            getTrackingRange: () => 8,
            spawnTo: async () => {}
        })
    );
    // A plain `Vector3`, which is what the packet carries. A `Position` would drag its world into
    // the data comparison.
    const position = Position.fromObject({ x: 100.5, y: 70, z: -20.5 });
    const arrival: Arrival = { world: target(), position, yaw: 90, pitch: 10 };
    sent.length = 0;

    await session.changeWorld(arrival);
    await session.deliver(6, -2);
    await session.flush();

    // `sent` collects whatever the connection stub was handed; the session only hands it packets.
    const packets: NetworkPacket<unknown>[] = sent;
    return packets;
};

/** One codec's round trip of one packet: the bytes it wrote, the data it read back, and the bytes it wrote again. */
interface RoundTrip {
    readonly bytes: Buffer;
    readonly data: unknown;
    readonly reencoded: Buffer;
}

const roundTrip = (codec: ProtocolCodec, packet: NetworkPacket<unknown>): RoundTrip => {
    const name = packet.getName();
    const netId = codec.netIdOf(name);
    expect(netId, `protocol ${codec.protocolVersion} has no id for ${name}`).toBeDefined();

    const outbound = codec.prepareOutbound(packet);
    outbound.setNetId(netId!);
    outbound.encode(codec.context);
    const bytes = Buffer.from(outbound.getBuffer());

    const inbound = codec.createPacket(netId!, bytes);
    expect(inbound, `protocol ${codec.protocolVersion} builds no ${name}`).not.toBeNull();
    inbound!.decode(codec.context);
    expect(inbound!.feof(), `${name} left bytes unread at protocol ${codec.protocolVersion}`).toBe(true);

    inbound!.encode(codec.context);
    return { bytes, data: inbound!.getPacketData(), reencoded: Buffer.from(inbound!.getBuffer()) };
};

describe(FAMILIES.protocolDimensionChange, () => {
    const codecs = registeredCodecs;
    let sequence: NetworkPacket<unknown>[] = [];
    let names: string[] = [];

    beforeAll(async () => {
        sequence = await captureSequence();
        names = sequence.map((packet) => packet.getName());
    });

    it('captures the sequence the client expects, with the arrival chunk carrying the target dimension', () => {
        expect(names).toContain('RemoveActorPacket');
        expect(names.indexOf('ChangeDimensionPacket')).toBeGreaterThan(names.indexOf('RemoveActorPacket'));
        expect(names.indexOf('StopSoundPacket')).toBeGreaterThan(names.indexOf('ChangeDimensionPacket'));
        expect(names.indexOf('NetworkChunkPublisherUpdatePacket')).toBeGreaterThan(names.indexOf('StopSoundPacket'));
        expect(names.indexOf('PlayerActionPacket')).toBeGreaterThan(names.indexOf('NetworkChunkPublisherUpdatePacket'));
        expect(names.indexOf('PlayStatusPacket')).toBeGreaterThan(names.indexOf('PlayerActionPacket'));

        const change = sequence.find((packet) => packet instanceof ChangeDimensionPacket);
        expect(change?.getPacketData()?.dimension).toBe(Dimensions.Nether.bedrockId);
        const chunks = sequence.filter((packet) => packet instanceof LevelChunkPacket);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.every((packet) => packet.getPacketData()?.dimension === Dimensions.Nether.bedrockId)).toBe(true);
    });

    it('registers both codecs this row compares', () => {
        expect(codecs.map((codec) => codec.protocolVersion)).toEqual(
            expect.arrayContaining([Codec2193.protocolVersion, Codec2225.protocolVersion])
        );
    });

    for (const codec of codecs) {
        describe(`protocol ${codec.protocolVersion}`, () => {
            it('encodes every packet of the sequence and decodes it back to the same bytes and data', () => {
                for (const packet of sequence) {
                    const sent = packet.getPacketData();
                    const trip = roundTrip(codec, packet);
                    expect(trip.reencoded, packet.getName()).toStrictEqual(trip.bytes);
                    // Every field the server set reads back equal. A version may append a gated
                    // field the server never set, such as `LevelChunk`'s `isClientBiomeUpdate` at
                    // 2225, which reads back as its fallback. The two field-style packets,
                    // RemoveActor and StopSound, keep their data on the instance rather than in a
                    // payload, so the byte comparison above is their whole check.
                    if (sent === null) continue;
                    expect(typeof sent, packet.getName()).toBe('object');
                    if (typeof sent !== 'object') continue;
                    expect(trip.data, packet.getName()).toMatchObject(sent);
                }
            });
        });
    }

    it('reads through a later codec everything an earlier codec reads, equal', () => {
        const ascending = [...codecs].sort((a, b) => a.protocolVersion - b.protocolVersion);
        for (const packet of sequence) {
            if (packet.getPacketData() === null) continue;
            let earlier: object | undefined;
            for (const codec of ascending) {
                const { data } = roundTrip(codec, packet);
                expect(typeof data, packet.getName()).toBe('object');
                if (typeof data !== 'object' || data === null) continue;
                if (earlier !== undefined) expect(data, packet.getName()).toMatchObject(earlier);
                earlier = data;
            }
        }
    });

    describe('DimensionDefinition', () => {
        const definition: DimensionDefinitionFields = {
            minimumY: -64,
            heightRange: 384,
            generatorType: 1,
            dimensionType: 1000,
            packId: new UUID(0x0f1e2d3c4b5a6978n, 0x8796a5b4c3d2e1f0n),
            defaultBiome: 'minecraft:plains',
            cloudHeight: 192,
            renderClouds: true
        };

        const through = (protocolVersion: number): { bytes: Buffer; read: DimensionDefinitionFields } => {
            const stream = new BinaryStream();
            writeDimensionDefinition(stream, definition, protocolVersion);
            const bytes = stream.getBuffer();
            const reader = new BinaryStream(bytes);
            const read = readDimensionDefinition(reader, protocolVersion);
            expect(reader.feof(), `protocol ${protocolVersion} left bytes unread`).toBe(true);
            return { bytes, read };
        };

        it('round-trips the cloud fields at protocol 2225', () => {
            expect(through(Codec2225.protocolVersion).read).toEqual(definition);
        });

        it('leaves the cloud fields off the wire at protocol 2193 and reads their fallbacks back', () => {
            const { bytes, read } = through(Codec2193.protocolVersion);
            expect(read).toEqual({ ...definition, cloudHeight: 0, renderClouds: false });
            expect(bytes.length).toBeLessThan(through(Codec2225.protocolVersion).bytes.length);
        });
    });

    it('reports how long the captured sequence is', () => {
        reportParityProgress(FAMILIES.protocolDimensionChange, {
            packets: sequence.length,
            packetTypes: new Set(names).size,
            codecs: codecs.length
        });
        expect(sequence.length).toBeGreaterThan(0);
    });
});
