import { inflateRaw, inflateRawSync } from 'zlib';
import { promisify } from 'util';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

const asyncInflate = promisify(inflateRaw);

export default class CompressionProvider {
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

    // TODO: move to full async... and remove this method...
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
