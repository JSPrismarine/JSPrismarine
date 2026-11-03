import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, DEFAULT_COMPRESSION_LEVEL } from '@jsprismarine/protocol';
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
    /** Use independently compressed, reusable packet fragments for this batch. */
    fullFlushFragments?: boolean;
    /** The protocol layout owner used as part of each fragment cache key. */
    fragmentCodec?: ProtocolCodec;
    /** Cache shared fragments for the lifetime appropriate to the caller. */
    fragmentCache?: FullFlushFragmentCache;
    /** Optional stable per-packet cache keys, used by serialized chunk payloads. */
    fragmentKeys?: readonly Buffer[];
    /** Extra packet identity when a stable key alone does not identify the full packet. */
    fragmentKeyDiscriminators?: readonly string[];
}

type CachedFragment = Buffer | Promise<Buffer>;

/**
 * Reuses a compressed packet fragment without retaining its source buffer.
 *
 * Tick paths use a short-lived cache. Chunk delivery may use the module cache because the
 * serialized payload is held by its chunk and changes identity whenever that chunk changes.
 */
export class FullFlushFragmentCache {
    private readonly byKey = new WeakMap<Buffer, Map<ProtocolCodec, Map<string, Map<number, CachedFragment>>>>();

    /**
     * Returns or synchronously creates a packet fragment.
     * @param key - Stable payload identity; weakly held so stale chunk revisions can be collected.
     * @param discriminator - Packet header fields not included in the stable payload key.
     * @param packet - The complete encoded packet body.
     * @param codec - The negotiated packet layout used to encode `packet`.
     * @param level - The zlib level used to compress the fragment.
     * @returns The cached full-flush fragment.
     */
    public getOrCreate(
        key: Buffer,
        discriminator: string,
        packet: Buffer,
        codec: ProtocolCodec,
        level: number
    ): Buffer {
        const levels = this.levelsFor(key, discriminator, codec);
        const cached = levels.get(level);
        if (cached instanceof Promise) {
            // A small batch can arrive while another session's large batch is encoding this key.
            // Recompress for that rare synchronous caller instead of blocking or replacing the pending cache entry.
            return BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level }).encodeFullFlushFragment(
                packet
            );
        }
        if (cached !== undefined) return cached;

        const fragment = BatchCodec.compressed({
            algorithm: PacketCompressionAlgorithm.ZLIB,
            level
        }).encodeFullFlushFragment(packet);
        levels.set(level, fragment);
        return fragment;
    }

    /**
     * Returns or asynchronously creates a packet fragment, sharing in-flight work for the same key.
     * @param key - Stable payload identity; weakly held so stale chunk revisions can be collected.
     * @param discriminator - Packet header fields not included in the stable payload key.
     * @param packet - The complete encoded packet body.
     * @param codec - The negotiated packet layout used to encode `packet`.
     * @param level - The zlib level used to compress the fragment.
     * @returns The cached or pending full-flush fragment.
     */
    public getOrCreateAsync(
        key: Buffer,
        discriminator: string,
        packet: Buffer,
        codec: ProtocolCodec,
        level: number
    ): Promise<Buffer> {
        const levels = this.levelsFor(key, discriminator, codec);
        const cached = levels.get(level);
        if (cached !== undefined) return cached instanceof Promise ? cached : Promise.resolve(cached);

        const pending = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level })
            .encodeFullFlushFragmentAsync(packet)
            .then((fragment) => {
                levels.set(level, fragment);
                return fragment;
            })
            .catch((error: unknown) => {
                levels.delete(level);
                throw error;
            });
        levels.set(level, pending);
        return pending;
    }

    /** Gets the nested cache slot for one payload, protocol, packet header, and level. */
    private levelsFor(key: Buffer, discriminator: string, codec: ProtocolCodec): Map<number, CachedFragment> {
        let byCodec = this.byKey.get(key);
        if (byCodec === undefined) {
            byCodec = new Map();
            this.byKey.set(key, byCodec);
        }
        let byDiscriminator = byCodec.get(codec);
        if (byDiscriminator === undefined) {
            byDiscriminator = new Map();
            byCodec.set(codec, byDiscriminator);
        }
        let byLevel = byDiscriminator.get(discriminator);
        if (byLevel === undefined) {
            byLevel = new Map();
            byDiscriminator.set(discriminator, byLevel);
        }
        return byLevel;
    }
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
/** A protocol-stamped packet and its bytes, ready to join into one or more batches. */
export interface EncodedPacketBuffers {
    /** Packets prepared for the selected protocol version. */
    packets: NetworkPacket<unknown>[];
    /** Bytes in the same order as `packets`. */
    buffers: Buffer[];
}

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
    const encoded = preparePackets(packets, codec, lifetime);
    const batchOptions = { ...options, fragmentCodec: options.fragmentCodec ?? codec };
    return encodePacketBatchFromBuffers(encoded.packets, encoded.buffers, batchOptions);
};

/**
 * Encodes packets once for one protocol codec so their buffers can be shared across audiences.
 * @param packets - Packets as the caller built them.
 * @param codec - The negotiated packet ids, layouts, and Protocol context.
 * @returns Protocol-stamped packets and their bytes in matching order.
 */
export const encodePacketsForCodec = (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    lifetime: PacketEncodingLifetime = 'transient'
): EncodedPacketBuffers => {
    return preparePackets(packets, codec, lifetime);
};

/**
 * Frames protocol-encoded packet buffers without encoding their packet objects again.
 * @param packets - The version-specific packets that produced `packetBuffers`.
 * @param packetBuffers - Encoded packet bodies in the same order as `packets`.
 * @param options - Compression state, zlib level, and size threshold.
 * @returns The batch ready for the transport.
 */
export const encodePacketBatchFromBuffers = (
    packets: readonly NetworkPacket<unknown>[],
    packetBuffers: readonly Buffer[],
    options: PacketBatchOptions = {}
): EncodedPacketBatch => {
    if (packets.length !== packetBuffers.length) {
        throw new RangeError(
            `Packet and buffer counts differ: ${packets.length} packets, ${packetBuffers.length} buffers`
        );
    }

    const batchCodec = batchCodecFor(options);
    const fragments = fragmentsForSync(packetBuffers, options);
    return {
        content:
            fragments === undefined
                ? batchCodec.encode(packetBuffers)
                : batchCodec.encodeFullFlushFragments(packetBuffers, fragments),
        packets,
        packetBuffers
    };
};

/**
 * Frames already encoded packets, compressing only when the configured body-size threshold is met.
 * @param packets - The version-specific packets that produced `packetBuffers`.
 * @param packetBuffers - Encoded packet bodies in the same order as `packets`.
 * @param options - Compression state, zlib level, and size threshold.
 * @returns The batch directly below the async deflate threshold, or a promise above it.
 */
export const encodePacketBatchFromBuffersBySize = (
    packets: readonly NetworkPacket<unknown>[],
    packetBuffers: readonly Buffer[],
    options: PacketBatchOptions = {}
): EncodedPacketBatch | Promise<EncodedPacketBatch> => {
    if (packets.length !== packetBuffers.length) {
        throw new RangeError(
            `Packet and buffer counts differ: ${packets.length} packets, ${packetBuffers.length} buffers`
        );
    }

    const batchCodec = batchCodecFor(options);
    // Bedrock's batch body includes each packet's varuint length prefix in the threshold.
    const bodyLength = packetBuffers.reduce(
        (length, packet) => length + varUIntLength(packet.byteLength) + packet.byteLength,
        0
    );

    if (options.compressed === false || options.compressionThreshold === 0) {
        return { content: batchCodec.encode(packetBuffers), packets, packetBuffers };
    }

    if (canUseFullFlushFragments(options) && shouldCompress(bodyLength, options)) {
        const fragmentCodec = requiredFragmentCodec(options);
        const cache = options.fragmentCache ?? new FullFlushFragmentCache();
        const keys = fragmentKeysFor(packetBuffers, options);
        const discriminators = fragmentDiscriminatorsFor(packetBuffers, options);
        if (bodyLength > ASYNC_PACKET_BATCH_THRESHOLD) {
            return Promise.all(
                packetBuffers.map((packet, index) =>
                    cache.getOrCreateAsync(
                        keys[index]!,
                        discriminators[index]!,
                        packet,
                        fragmentCodec,
                        options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL
                    )
                )
            ).then((fragments) => ({
                content: batchCodec.encodeFullFlushFragments(packetBuffers, fragments),
                packets,
                packetBuffers
            }));
        }
        const fragments = packetBuffers.map((packet, index) =>
            cache.getOrCreate(
                keys[index]!,
                discriminators[index]!,
                packet,
                fragmentCodec,
                options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL
            )
        );
        return { content: batchCodec.encodeFullFlushFragments(packetBuffers, fragments), packets, packetBuffers };
    }

    if (bodyLength <= ASYNC_PACKET_BATCH_THRESHOLD) {
        return { content: batchCodec.encode(packetBuffers), packets, packetBuffers };
    }

    return batchCodec.encodeAsync(packetBuffers).then((content) => ({ content, packets, packetBuffers }));
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
    const encoded = encodePacketsForCodec(packets, codec, lifetime);
    return encodePacketBatchFromBuffersBySize(encoded.packets, encoded.buffers, {
        ...options,
        fragmentCodec: options.fragmentCodec ?? codec
    });
};

/** The async counterpart for large batches whose deflate should leave the main thread. */
export const encodePacketBatchAsync = async (
    packets: readonly NetworkPacket<unknown>[],
    codec: ProtocolCodec,
    options: PacketBatchOptions = {}
): Promise<EncodedPacketBatch> => {
    const encoded = encodePacketsForCodec(packets, codec);
    const batchOptions = { ...options, fragmentCodec: options.fragmentCodec ?? codec };
    const batchCodec = batchCodecFor(batchOptions);

    if (canUseFullFlushFragments(batchOptions) && shouldCompress(bodyLengthOf(encoded.buffers), batchOptions)) {
        const fragmentCodec = requiredFragmentCodec(batchOptions);
        const cache = batchOptions.fragmentCache ?? new FullFlushFragmentCache();
        const keys = fragmentKeysFor(encoded.buffers, batchOptions);
        const discriminators = fragmentDiscriminatorsFor(encoded.buffers, batchOptions);
        const fragments = await Promise.all(
            encoded.buffers.map((packet, index) =>
                cache.getOrCreateAsync(
                    keys[index]!,
                    discriminators[index]!,
                    packet,
                    fragmentCodec,
                    batchOptions.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL
                )
            )
        );
        return {
            content: batchCodec.encodeFullFlushFragments(encoded.buffers, fragments),
            packets: encoded.packets,
            packetBuffers: encoded.buffers
        };
    }

    return {
        content: await batchCodec.encodeAsync(encoded.buffers),
        packets: encoded.packets,
        packetBuffers: encoded.buffers
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

const bodyLengthOf = (buffers: readonly Buffer[]): number =>
    buffers.reduce((length, packet) => length + varUIntLength(packet.byteLength) + packet.byteLength, 0);

const shouldCompress = (bodyLength: number, options: PacketBatchOptions): boolean =>
    options.compressed !== false &&
    (options.compressionThreshold ?? 1) !== 0 &&
    bodyLength >= (options.compressionThreshold ?? 1);

// Full-flush fragments are zlib streams; Snappy and no-compression keep the normal batch path.
const canUseFullFlushFragments = (options: PacketBatchOptions): boolean =>
    options.fullFlushFragments === true &&
    (options.compressionAlgorithm ?? PacketCompressionAlgorithm.ZLIB) === PacketCompressionAlgorithm.ZLIB;

const requiredFragmentCodec = (options: PacketBatchOptions): ProtocolCodec => {
    if (options.fragmentCodec === undefined) {
        throw new Error('Full-flush fragments require a protocol codec cache key');
    }
    return options.fragmentCodec;
};

const fragmentKeysFor = (buffers: readonly Buffer[], options: PacketBatchOptions): readonly Buffer[] => {
    const keys = options.fragmentKeys ?? buffers;
    if (keys.length !== buffers.length) {
        throw new RangeError(`Packet and fragment-key counts differ: ${buffers.length} packets, ${keys.length} keys`);
    }
    return keys;
};

const fragmentDiscriminatorsFor = (buffers: readonly Buffer[], options: PacketBatchOptions): readonly string[] => {
    const discriminators = options.fragmentKeyDiscriminators ?? buffers.map(() => '');
    if (discriminators.length !== buffers.length) {
        throw new RangeError(
            `Packet and fragment-discriminator counts differ: ${buffers.length} packets, ${discriminators.length} discriminators`
        );
    }
    return discriminators;
};

const fragmentsForSync = (buffers: readonly Buffer[], options: PacketBatchOptions): Buffer[] | undefined => {
    if (!canUseFullFlushFragments(options) || !shouldCompress(bodyLengthOf(buffers), options)) return undefined;

    const codec = requiredFragmentCodec(options);
    const cache = options.fragmentCache ?? new FullFlushFragmentCache();
    const keys = fragmentKeysFor(buffers, options);
    const discriminators = fragmentDiscriminatorsFor(buffers, options);
    return buffers.map((packet, index) =>
        cache.getOrCreate(
            keys[index]!,
            discriminators[index]!,
            packet,
            codec,
            options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL
        )
    );
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
