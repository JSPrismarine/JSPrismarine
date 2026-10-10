import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { promisify } from 'node:util';
import { deflateRaw, deflateRawSync, inflateRaw, inflateRawSync } from 'node:zlib';

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

/**
 * "Not compressed", as a batch's prefix byte says it.
 *
 * The same idea travels at two widths and they do not agree. `NetworkSettings` negotiates
 * the algorithm in a two byte field, where none is `0xffff`; every batch then repeats it in
 * a *single* byte, where none is `0xff`. Reading the byte straight into
 * {@link PacketCompressionAlgorithm} therefore matches nothing and throws - which showed up
 * as "Failed to inflate batched content" the moment a client sent its first uncompressed
 * packet, a few packets into a login it had otherwise completed.
 */
export const UNCOMPRESSED_BATCH = 0xff;

/**
 * What the server compressed at before the level was configurable.
 *
 * Higher means less bandwidth and more CPU. Measured on a 10 KiB chunk payload: level 7
 * costs 0.367 ms, level 1 costs 0.111 ms.
 */
export const DEFAULT_COMPRESSION_LEVEL = 7;

/**
 * Ceiling on what one batch may inflate to.
 *
 * A compressed payload arrives inside a single RakNet message, so it is bounded by
 * reassembly at roughly 2.8 MiB - but what it *expands* to is bounded by nothing at all,
 * and both a server and a client here read compressed bytes from a peer they have not
 * authenticated yet. zlib enforces the limit itself rather than us discovering it after
 * allocating.
 */
export const DEFAULT_MAX_DECOMPRESSED_LENGTH = 16 * 1024 * 1024;

export interface CompressionSettings {
    readonly algorithm: PacketCompressionAlgorithm;
    /** zlib only; ignored by the other algorithms. */
    readonly level?: number;
    /**
     * Payloads shorter than this go out uncompressed, carrying {@link UNCOMPRESSED_BATCH}
     * as their prefix. Zero disables compression altogether, which is what Mojang's
     * `compressionThreshold` of 0 means - not "compress everything from 0 bytes up".
     */
    readonly threshold?: number;
    readonly maxDecompressedLength?: number;
}

/**
 * The compression half of a batch, and nothing else: no framing, no packet boundaries, no
 * session state beyond what `NetworkSettings` negotiated once.
 *
 * An instance is what a connection agreed to. The decompression side is static because a
 * batch names its own algorithm in its prefix byte, and a peer is entitled to send an
 * uncompressed one at any point - so what we decompress with is read off the wire, not
 * assumed from what we negotiated.
 */
export class CompressionCodec {
    private readonly threshold: number;
    private readonly level: number;
    private readonly maxDecompressedLength: number;

    public constructor(private readonly settings: CompressionSettings) {
        this.threshold = settings.threshold ?? 1;
        this.level = settings.level ?? DEFAULT_COMPRESSION_LEVEL;
        this.maxDecompressedLength = settings.maxDecompressedLength ?? DEFAULT_MAX_DECOMPRESSED_LENGTH;
    }

    /**
     * The algorithm a batch's one byte prefix names, widened to the negotiated form.
     * @param prefix - the byte following the batch id.
     */
    public static fromPrefix(prefix: number): PacketCompressionAlgorithm {
        return prefix === UNCOMPRESSED_BATCH ? PacketCompressionAlgorithm.NONE : (prefix as PacketCompressionAlgorithm);
    }

    /** The inverse of {@link fromPrefix}: what to write for an algorithm. */
    public static toPrefix(algorithm: PacketCompressionAlgorithm): number {
        return algorithm === PacketCompressionAlgorithm.NONE ? UNCOMPRESSED_BATCH : algorithm;
    }

    public getAlgorithm(): PacketCompressionAlgorithm {
        return this.settings.algorithm;
    }

    /**
     * Whether a payload of this size is worth compressing. Below the threshold deflate
     * reliably makes the payload *larger*, and the peer is told so by the prefix.
     */
    public shouldCompress(byteLength: number): boolean {
        if (this.settings.algorithm === PacketCompressionAlgorithm.NONE) return false;
        if (this.threshold === 0) return false;

        return byteLength >= this.threshold;
    }

    /** The algorithm this payload will actually go out under, threshold included. */
    public algorithmFor(byteLength: number): PacketCompressionAlgorithm {
        return this.shouldCompress(byteLength) ? this.settings.algorithm : PacketCompressionAlgorithm.NONE;
    }

    public compress(payload: Buffer): Buffer {
        if (!this.shouldCompress(payload.byteLength)) return payload;

        switch (this.settings.algorithm) {
            case PacketCompressionAlgorithm.ZLIB:
                return deflateRawSync(payload, { level: this.level });
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                return payload;
        }
    }

    /**
     * The same, on zlib's asynchronous API.
     *
     * Node runs that on the libuv thread pool, so the work genuinely leaves the main thread
     * rather than merely being deferred on it. Worth the extra await for chunk batches,
     * which are the large and frequent ones; small packets cost more in a trip through the
     * pool than they do to compress.
     */
    public async compressAsync(payload: Buffer): Promise<Buffer> {
        if (!this.shouldCompress(payload.byteLength)) return payload;

        switch (this.settings.algorithm) {
            case PacketCompressionAlgorithm.ZLIB:
                return deflateRawAsync(payload, { level: this.level });
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                return payload;
        }
    }

    public static decompress(
        algorithm: PacketCompressionAlgorithm,
        payload: Buffer,
        maxOutputLength: number = DEFAULT_MAX_DECOMPRESSED_LENGTH
    ): Buffer {
        switch (algorithm) {
            case PacketCompressionAlgorithm.NONE:
                return payload;
            case PacketCompressionAlgorithm.ZLIB:
                return inflateRawSync(payload, { maxOutputLength });
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                throw new Error(`Unsupported compression algorithm: ${algorithm}`);
        }
    }

    public static async decompressAsync(
        algorithm: PacketCompressionAlgorithm,
        payload: Buffer,
        maxOutputLength: number = DEFAULT_MAX_DECOMPRESSED_LENGTH
    ): Promise<Buffer> {
        switch (algorithm) {
            case PacketCompressionAlgorithm.NONE:
                return payload;
            case PacketCompressionAlgorithm.ZLIB:
                return inflateRawAsync(payload, { maxOutputLength });
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                throw new Error(`Unsupported compression algorithm: ${algorithm}`);
        }
    }

    /** Reads a batch's prefix byte with {@link maxDecompressedLength} already applied. */
    public decompress(algorithm: PacketCompressionAlgorithm, payload: Buffer): Buffer {
        return CompressionCodec.decompress(algorithm, payload, this.maxDecompressedLength);
    }

    public async decompressAsync(algorithm: PacketCompressionAlgorithm, payload: Buffer): Promise<Buffer> {
        return CompressionCodec.decompressAsync(algorithm, payload, this.maxDecompressedLength);
    }
}
