import { promisify } from 'node:util';

import { inflateRaw, inflateRawSync } from 'zlib';
import { PacketCompressionAlgorithm } from './packet/NetworkSettingsPacket.js';

const asyncInflate = promisify(inflateRaw);

/**
 * A provider for decompressing packets.
 */
export class CompressionProvider {
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
