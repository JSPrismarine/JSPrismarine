import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type { ProtocolCodec } from './codec/ProtocolCodec';

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
}

/**
 * Prepares each packet for one negotiated Protocol codec and frames their bytes with Protocol's
 * batch codec. The server owns codec selection; Protocol owns packet encoding and batch layout.
 * @param packets - Packets as the caller built them.
 * @param codec - The negotiated packet ids, layouts, and Protocol context.
 * @param options - Compression state and optional zlib level.
 * @returns Version-specific packets and their framed batch.
 */
export const encodePacketBatch = (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {}
): EncodedPacketBatch => {
    const encodedPackets = preparePackets(packets, codec);
    const batchCodec = batchCodecFor(options);

    return {
        content: batchCodec.encode(encodedPackets.map((packet) => packet.getBuffer())),
        packets: encodedPackets
    };
};

/** The async counterpart for large batches whose deflate should leave the main thread. */
export const encodePacketBatchAsync = async (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {}
): Promise<EncodedPacketBatch> => {
    const encodedPackets = preparePackets(packets, codec);
    const batchCodec = batchCodecFor(options);

    return {
        content: await batchCodec.encodeAsync(encodedPackets.map((packet) => packet.getBuffer())),
        packets: encodedPackets
    };
};

const preparePackets = (packets: readonly NetworkPacket<unknown>[], codec: ProtocolCodec): NetworkPacket<unknown>[] =>
    packets.map((source) => {
        const packet = codec.prepareOutbound(source);
        const netId = codec.netIdOf(packet.getName());
        if (netId !== undefined) packet.setNetId(netId);
        packet.encode(codec.context);
        return packet;
    });

const batchCodecFor = ({ compressed = true, compressionLevel }: PacketBatchOptions): BatchCodec =>
    compressed
        ? BatchCodec.compressed({
              algorithm: PacketCompressionAlgorithm.ZLIB,
              ...(compressionLevel === undefined ? {} : { level: compressionLevel }),
              threshold: 1
          })
        : BatchCodec.uncompressed();
