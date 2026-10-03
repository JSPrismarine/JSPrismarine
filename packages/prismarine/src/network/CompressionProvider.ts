import { promisify } from 'node:util';

import { inflateRaw, inflateRawSync } from 'zlib';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

const asyncInflate = promisify(inflateRaw);

/**
 * "Not compressed", as a batch's prefix byte says it.
 *
 * The same idea travels at two widths and they do not agree. `NetworkSettingsPacket` negotiates the
 * algorithm in a two byte field, where none is `0xffff`; every batch then repeats it in a *single*
 * byte, where none is `0xff`. Reading the byte straight into
 * {@link PacketCompressionAlgorithm} therefore matches nothing and throws - which shows up as
 * "Failed to inflate batched content" the moment a client sends its first uncompressed packet,
 * a few packets into the login it had otherwise completed.
 */
export const UNCOMPRESSED_BATCH = 0xff;

/**
 * A provider for decompressing packets.
 */
export class CompressionProvider {
    /**
     * The algorithm a batch's one byte prefix names.
     * @param {number} prefix - The byte following the batch id.
     * @returns {PacketCompressionAlgorithm} The algorithm, widened to the negotiated form.
     */
    public static fromBatchPrefix(prefix: number): PacketCompressionAlgorithm {
        return prefix === UNCOMPRESSED_BATCH ? PacketCompressionAlgorithm.NONE : (prefix as PacketCompressionAlgorithm);
    }
    /**
     * Create a new compression provider.
     * @param {PacketCompressionAlgorithm} algorithm - The compression algorithm to use.
     * @returns {Function} A function that will decompress the buffer.
     */
    public static fromAlgorithm(algorithm: PacketCompressionAlgorithm): (buffer: Buffer) => Promise<Buffer> {
        switch (algorithm) {
            case PacketCompressionAlgorithm.ZLIB:
                // return new ZlibCompressionProvider();
                return asyncInflate;
            case PacketCompressionAlgorithm.NONE:
                return async (buffer: Buffer) => buffer;
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                throw new Error(`Unsupported compression algorithm: ${algorithm}`);
        }
    }

    /**
     * Create a new compression provider.
     *
     * @todo Move to full async... and remove this method...
     * @param {PacketCompressionAlgorithm} algorithm - The compression algorithm to use.
     * @returns {Function} A function that will decompress the buffer.
     */
    public static fromAlgorithmSync(algorithm: PacketCompressionAlgorithm): (buffer: Buffer) => Buffer {
        switch (algorithm) {
            case PacketCompressionAlgorithm.ZLIB:
                // return new ZlibCompressionProvider();
                return inflateRawSync;
            case PacketCompressionAlgorithm.NONE:
                return (buffer: Buffer) => buffer;
            case PacketCompressionAlgorithm.SNAPPY:
                throw new Error('Snappy compression is not implemented');
            default:
                throw new Error(`Unsupported compression algorithm: ${algorithm}`);
        }
    }
}
