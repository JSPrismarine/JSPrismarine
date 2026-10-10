/**
 * Snappy block-format decompression.
 *
 * Upstream LevelDB's default compression, so it turns up in tables written by tools other than
 * the game. Decompression only: we always write `ZlibRaw`, which is what Bedrock itself writes,
 * so there is never a reason for us to produce a Snappy block.
 *
 * The format is a varint of the decompressed length followed by a stream of tags. A tag's low two
 * bits say which of the four kinds it is; the rest is either a literal run or a copy from earlier
 * in the output.
 * @see https://github.com/google/snappy/blob/main/format_description.txt
 */

const TAG_LITERAL = 0;
const TAG_COPY_1 = 1;
const TAG_COPY_2 = 2;
const TAG_COPY_4 = 3;

export class SnappyError extends Error {
    public constructor(message: string) {
        super(`Malformed snappy stream: ${message}`);
        this.name = 'SnappyError';
    }
}

export const snappyDecompress = (input: Buffer): Buffer => {
    let at = 0;

    const readVarint = (): number => {
        let result = 0;
        for (let shift = 0; shift <= 28; shift += 7) {
            if (at >= input.byteLength) throw new SnappyError('truncated length prefix');

            const byte = input.readUInt8(at++);
            result = (result | ((byte & 0x7f) << shift)) >>> 0;
            if ((byte & 0x80) === 0) return result;
        }

        throw new SnappyError('length prefix did not terminate');
    };

    const expected = readVarint();
    const output = Buffer.allocUnsafe(expected);
    let out = 0;

    const copy = (offset: number, length: number): void => {
        if (offset === 0 || offset > out) throw new SnappyError(`copy offset ${offset} points outside the output`);
        if (out + length > expected) throw new SnappyError('copy runs past the declared length');

        // Byte by byte, not `copyWithin`: an overlapping copy is how Snappy expresses a repeat,
        // and it is meant to read the bytes this very loop is writing.
        let from = out - offset;
        for (let i = 0; i < length; i++) output.writeUInt8(output.readUInt8(from++), out++);
    };

    while (at < input.byteLength) {
        const tag = input.readUInt8(at++);

        switch (tag & 0x03) {
            case TAG_LITERAL: {
                let length = tag >>> 2;
                if (length >= 60) {
                    // 60..63 mean the length itself is the next 1..4 bytes, little endian.
                    const extra = length - 59;
                    if (at + extra > input.byteLength) throw new SnappyError('truncated literal length');

                    length = 0;
                    for (let i = 0; i < extra; i++) length |= input.readUInt8(at + i) << (8 * i);
                    length >>>= 0;
                    at += extra;
                }

                length += 1;
                if (at + length > input.byteLength) throw new SnappyError('truncated literal');
                if (out + length > expected) throw new SnappyError('literal runs past the declared length');

                input.copy(output, out, at, at + length);
                at += length;
                out += length;
                break;
            }

            case TAG_COPY_1: {
                if (at >= input.byteLength) throw new SnappyError('truncated 1 byte copy');

                const length = 4 + ((tag >>> 2) & 0x07);
                const offset = (((tag >>> 5) & 0x07) << 8) | input.readUInt8(at++);
                copy(offset, length);
                break;
            }

            case TAG_COPY_2: {
                if (at + 2 > input.byteLength) throw new SnappyError('truncated 2 byte copy');

                const length = (tag >>> 2) + 1;
                const offset = input.readUInt16LE(at);
                at += 2;
                copy(offset, length);
                break;
            }

            case TAG_COPY_4:
            default: {
                if (at + 4 > input.byteLength) throw new SnappyError('truncated 4 byte copy');

                const length = (tag >>> 2) + 1;
                const offset = input.readUInt32LE(at);
                at += 4;
                copy(offset, length);
                break;
            }
        }
    }

    if (out !== expected) {
        throw new SnappyError(`produced ${out} bytes, the header declared ${expected}`);
    }

    return output;
};
