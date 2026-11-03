import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type { ProtocolCodec } from '@jsprismarine/protocol';

/** Options the server supplies when framing already-encoded Minecraft packets. */
export interface PacketBatchOptions {
    /** Whether the negotiated batch format includes a compression prefix. */
    compressed?: boolean;
    /** Algorithm advertised by this connection in `NetworkSettings`. */
    compressionAlgorithm?: PacketCompressionAlgorithm;
    /** Smallest batch payload size to compress; zero leaves every batch uncompressed. */
    compressionThreshold?: number;
    /** zlib level for this batch; omitted to use Protocol's default. */
    compressionLevel?: number;
}

/** Encoded packet objects and the batch that carries them. */
export interface EncodedPacketBatch {
    /** The framed bytes ready for the transport. */
    content: Buffer;
    /** The version-specific packets that produced those bytes. */
    packets: readonly NetworkPacket<unknown>[];
    /** Transient packet views, valid for the synchronous batch assembly and packet diagnostics. */
    packetBuffers: readonly Buffer[];
}

/** Whether encoded packet views are for immediate framing or caller retention. */
export type PacketEncodingLifetime = 'transient' | 'cached';
/** Compressed packet bodies above this size use zlib's asynchronous API. */
export const ASYNC_PACKET_BATCH_THRESHOLD = 64 * 1024;

/**
 * Prepares each packet for one negotiated Protocol codec and frames their bytes with Protocol's
 * batch codec. The server owns codec selection; Protocol owns packet encoding and batch layout.
 * @param packets - Packets as the caller built them.
 * @param codec - The negotiated packet ids, layouts, and Protocol context.
 * @param options - Compression state and optional zlib level.
 * @param lifetime - Keep packet bytes on each packet when callers need its cached `getBuffer()` contract.
 * @returns Version-specific packets and their framed batch.
 */
export const encodePacketBatch = (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {},
    lifetime: PacketEncodingLifetime = 'transient'
): EncodedPacketBatch => {
    const { packets: encodedPackets, buffers } = preparePackets(packets, codec, lifetime);
    const batchCodec = batchCodecFor(options);

    return {
        content: batchCodec.encode(buffers),
        packets: encodedPackets,
        packetBuffers: buffers
    };
};

/**
 * Encodes small batches synchronously and moves larger deflates to the libuv pool.
 * Packet encoding still runs once on the calling thread; only zlib moves off it.
 * @param packets - Packets as the caller built them.
 * @param codec - The negotiated packet ids, layouts, and Protocol context.
 * @param options - Compression state and optional zlib level.
 * @returns The batch directly below the threshold, or a promise above it.
 */
export const encodePacketBatchBySize = (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {},
    lifetime: PacketEncodingLifetime = 'transient'
): EncodedPacketBatch | Promise<EncodedPacketBatch> => {
    const { packets: encodedPackets, buffers: packetBuffers } = preparePackets(packets, codec, lifetime);
    const batchCodec = batchCodecFor(options);
    // Bedrock's batch body includes each packet's varuint length prefix in the threshold.
    const bodyLength = packetBuffers.reduce(
        (length, packet) => length + varUIntLength(packet.byteLength) + packet.byteLength,
        0
    );

    if (options.compressed === false || bodyLength <= ASYNC_PACKET_BATCH_THRESHOLD) {
        return { content: batchCodec.encode(packetBuffers), packets: encodedPackets, packetBuffers };
    }

    return batchCodec
        .encodeAsync(packetBuffers)
        .then((content) => ({ content, packets: encodedPackets, packetBuffers }));
};

/** The async counterpart for large batches whose deflate should leave the main thread. */
export const encodePacketBatchAsync = async (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {}
): Promise<EncodedPacketBatch> => {
    const { packets: encodedPackets, buffers } = preparePackets(packets, codec);
    const batchCodec = batchCodecFor(options);

    return {
        content: await batchCodec.encodeAsync(buffers),
        packets: encodedPackets,
        packetBuffers: buffers
    };
};

const preparePackets = (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    lifetime: PacketEncodingLifetime = 'transient'
): { packets: NetworkPacket<unknown>[]; buffers: Buffer[] } => {
    const encodedPackets: NetworkPacket<unknown>[] = [];
    const buffers: Buffer[] = [];
    for (const source of packets) {
        const packet = codec.prepareOutbound(source);
        const netId = codec.netIdOf(packet.getName());
        if (netId !== undefined) packet.setNetId(netId);
        if (lifetime === 'cached') {
            packet.encode(codec.context);
            buffers.push(packet.getBuffer());
        } else {
            buffers.push(packet.encodeTransient(codec.context));
        }
        encodedPackets.push(packet);
    }
    return { packets: encodedPackets, buffers };
};

const varUIntLength = (value: number): number => {
    let length = 1;
    while (value >= 0x80) {
        value = Math.floor(value / 0x80);
        length++;
    }
    return length;
};

const batchCodecFor = ({
    compressed = true,
    compressionAlgorithm = PacketCompressionAlgorithm.ZLIB,
    compressionThreshold = 1,
    compressionLevel
}: PacketBatchOptions): BatchCodec =>
    compressed
        ? BatchCodec.compressed({
              algorithm: compressionAlgorithm,
              ...(compressionLevel === undefined ? {} : { level: compressionLevel }),
              threshold: compressionThreshold
          })
        : BatchCodec.uncompressed();
