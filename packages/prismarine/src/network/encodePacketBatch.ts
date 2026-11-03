import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type { ProtocolCodec } from '@jsprismarine/protocol';

/** Options the server supplies when framing already-encoded Minecraft packets. */
export interface PacketBatchOptions {
    /** Whether the negotiated batch format includes a compression prefix. */
    compressed?: boolean;
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

const batchCodecFor = ({ compressed = true, compressionLevel }: PacketBatchOptions): BatchCodec =>
    compressed
        ? BatchCodec.compressed({
              algorithm: PacketCompressionAlgorithm.ZLIB,
              ...(compressionLevel === undefined ? {} : { level: compressionLevel }),
              threshold: 1
          })
        : BatchCodec.uncompressed();
