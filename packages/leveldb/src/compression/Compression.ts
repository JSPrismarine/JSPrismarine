import zlib from 'node:zlib';

import { snappyDecompress } from './Snappy';

/**
 * The compression byte that trails every table block.
 *
 * `Zlib` and `ZlibRaw` are Mojang's additions - upstream LevelDB knows only `None` and `Snappy`
 * and returns a corruption error for anything else, which is exactly why a stock binding cannot
 * open a Bedrock world. `ZlibRaw` is what the game writes: a DEFLATE stream with no zlib header
 * and no trailing Adler-32, since the block already carries a CRC-32C of its own.
 */
export enum CompressionType {
    None = 0,
    Snappy = 1,
    Zlib = 2,
    ZlibRaw = 4
}

export const isCompressionType = (value: number): value is CompressionType =>
    value === CompressionType.None ||
    value === CompressionType.Snappy ||
    value === CompressionType.Zlib ||
    value === CompressionType.ZlibRaw;

export const decompress = (type: CompressionType, data: Buffer): Buffer => {
    switch (type) {
        case CompressionType.None:
            return data;
        case CompressionType.Snappy:
            return snappyDecompress(data);
        case CompressionType.Zlib:
            return zlib.inflateSync(data);
        case CompressionType.ZlibRaw:
            return zlib.inflateRawSync(data);
        default:
            throw new Error(`Unknown block compression type ${type}`);
    }
};

/**
 * Compresses a block, falling back to storing it uncompressed when compression does not pay - the
 * same 12.5% threshold upstream LevelDB uses, so a block of incompressible data does not grow.
 *
 * Snappy is not a supported output: we have no compressor for it, and there is no reason to want
 * one when the game reads all four types.
 */
export const compress = (
    type: CompressionType,
    data: Buffer,
    level: number = zlib.constants.Z_DEFAULT_COMPRESSION
): { type: CompressionType; data: Buffer } => {
    if (type === CompressionType.None) return { type, data };

    if (type === CompressionType.Snappy) {
        throw new Error('Snappy compression is not implemented; blocks are written as ZlibRaw');
    }

    const options = { level };
    const compressed =
        type === CompressionType.ZlibRaw ? zlib.deflateRawSync(data, options) : zlib.deflateSync(data, options);

    if (compressed.byteLength >= data.byteLength - data.byteLength / 8) {
        return { type: CompressionType.None, data };
    }

    return { type, data: compressed };
};
