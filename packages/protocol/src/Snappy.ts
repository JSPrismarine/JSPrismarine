/**
 * Encodes and decodes the Snappy block format used by Bedrock packet batches.
 *
 * This is the block format, not Snappy's stream framing: `NetworkSettings` supplies the
 * algorithm and each batch carries its own one-byte algorithm prefix.
 */

/** Writes the uncompressed length used at the start of a Snappy block. */
const writeLength = (output: Buffer, cursor: number, length: number): number => {
    while (length > 0x7f) {
        output[cursor++] = (length & 0x7f) | 0x80;
        length >>>= 7;
    }
    output[cursor++] = length;
    return cursor;
};

/** Writes one Snappy literal, using the shortest literal-length form. */
const writeLiteral = (output: Buffer, cursor: number, input: Buffer, start: number, end: number): number => {
    const length = end - start;
    if (length === 0) return cursor;

    if (length <= 60) {
        output[cursor++] = (length - 1) << 2;
    } else {
        const lengthMinusOne = length - 1;
        const width = lengthMinusOne <= 0xff ? 1 : lengthMinusOne <= 0xffff ? 2 : lengthMinusOne <= 0xffffff ? 3 : 4;
        output[cursor++] = (59 + width) << 2;
        for (let byte = 0; byte < width; byte++) output[cursor++] = (lengthMinusOne >>> (byte * 8)) & 0xff;
    }

    input.copy(output, cursor, start, end);
    return cursor + length;
};

/** Writes a copy as one or more 2-byte-offset tags (each carries at most 64 bytes). */
const writeCopy = (output: Buffer, cursor: number, offset: number, length: number): number => {
    while (length > 0) {
        const part = Math.min(length, 64);
        output[cursor++] = ((part - 1) << 2) | 0x02;
        output[cursor++] = offset & 0xff;
        output[cursor++] = offset >>> 8;
        length -= part;
    }
    return cursor;
};

/** Hashes four bytes into a fixed table; collisions are checked before using the match. */
const hashFourBytes = (input: Buffer, offset: number): number => {
    const word = input[offset]! | (input[offset + 1]! << 8) | (input[offset + 2]! << 16) | (input[offset + 3]! << 24);
    return (Math.imul(word, 0x1e35a7bd) >>> 18) & 0x3fff;
};

/**
 * Compresses one Snappy block.
 *
 * A fixed hash table bounds scratch memory independently of packet size. The encoder uses
 * the newest matching four-byte prefix and emits copy tags only for exact matches, so hash
 * collisions affect compression ratio but never output correctness.
 * @param input - The packet bytes inside one batch.
 * @returns A Snappy block whose decoded bytes equal `input`.
 */
export const snappyCompress = (input: Buffer): Buffer => {
    // The extra bytes cover the block-length prefix and one tag per small literal run. The
    // matching rule emits at least four copied bytes per copy tag, so the body cannot exceed
    // this input-sized bound by more than that small fixed header allowance.
    const output = Buffer.allocUnsafe(input.byteLength + Math.ceil(input.byteLength / 60) + 32);
    let outputCursor = writeLength(output, 0, input.byteLength);
    const table = new Int32Array(1 << 14);
    table.fill(-1);
    let literalStart = 0;
    let cursor = 0;

    while (cursor + 4 <= input.byteLength) {
        const slot = hashFourBytes(input, cursor);
        const previous = table[slot]!;
        table[slot] = cursor;

        if (
            previous < 0 ||
            cursor - previous > 0xffff ||
            input[previous] !== input[cursor] ||
            input[previous + 1] !== input[cursor + 1] ||
            input[previous + 2] !== input[cursor + 2] ||
            input[previous + 3] !== input[cursor + 3]
        ) {
            cursor++;
            continue;
        }

        outputCursor = writeLiteral(output, outputCursor, input, literalStart, cursor);
        let length = 4;
        while (cursor + length < input.byteLength && input[previous + length] === input[cursor + length]) length++;
        outputCursor = writeCopy(output, outputCursor, cursor - previous, length);

        // Index the matched region too, so repeated data can be referenced immediately.
        const end = cursor + length;
        for (let index = cursor + 1; index + 4 <= end; index++) table[hashFourBytes(input, index)] = index;
        cursor = end;
        literalStart = cursor;
    }

    outputCursor = writeLiteral(output, outputCursor, input, literalStart, input.byteLength);
    return output.subarray(0, outputCursor);
};

/** Reads a Snappy block length while rejecting truncated and overflowing prefixes. */
const readLength = (input: Buffer): { length: number; cursor: number } => {
    let length = 0;
    let shift = 0;

    for (let index = 0; index < 5; index++) {
        const byte = input[index];
        if (byte === undefined) throw new Error('Malformed Snappy block: truncated length prefix');
        if (index === 4 && (byte & 0xf0) !== 0) throw new Error('Malformed Snappy block: length overflows 32 bits');
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return { length: length >>> 0, cursor: index + 1 };
        shift += 7;
    }

    throw new Error('Malformed Snappy block: unterminated length prefix');
};

/**
 * Decompresses one Snappy block into a bounded output buffer.
 * @param input - The Snappy block from a batch.
 * @param maxOutputLength - Maximum decoded size accepted from a peer.
 * @returns The exact uncompressed block.
 */
export const snappyDecompress = (input: Buffer, maxOutputLength: number): Buffer => {
    const { length, cursor: firstTag } = readLength(input);
    if (length > maxOutputLength)
        throw new Error(`Snappy block expands to ${length} bytes, limit is ${maxOutputLength}`);

    const output = Buffer.allocUnsafe(length);
    let inputCursor = firstTag;
    let outputCursor = 0;

    while (inputCursor < input.byteLength) {
        const tag = input[inputCursor++]!;
        const type = tag & 0x03;

        if (type === 0) {
            const encodedLength = tag >>> 2;
            let literalLength: number;
            if (encodedLength < 60) {
                literalLength = encodedLength + 1;
            } else {
                const width = encodedLength - 59;
                if (inputCursor + width > input.byteLength)
                    throw new Error('Malformed Snappy block: truncated literal length');
                let value = 0;
                for (let byte = 0; byte < width; byte++) value |= input[inputCursor + byte]! << (byte * 8);
                inputCursor += width;
                literalLength = (value >>> 0) + 1;
            }

            if (inputCursor + literalLength > input.byteLength || outputCursor + literalLength > length) {
                throw new Error('Malformed Snappy block: literal exceeds its input or output');
            }
            input.copy(output, outputCursor, inputCursor, inputCursor + literalLength);
            inputCursor += literalLength;
            outputCursor += literalLength;
            continue;
        }

        let copyLength: number;
        let offset: number;
        if (type === 1) {
            if (inputCursor >= input.byteLength) throw new Error('Malformed Snappy block: truncated 1-byte copy');
            copyLength = 4 + ((tag >>> 2) & 0x07);
            offset = ((tag & 0xe0) << 3) | input[inputCursor++]!;
        } else if (type === 2) {
            if (inputCursor + 2 > input.byteLength) throw new Error('Malformed Snappy block: truncated 2-byte copy');
            copyLength = (tag >>> 2) + 1;
            offset = input.readUInt16LE(inputCursor);
            inputCursor += 2;
        } else {
            if (inputCursor + 4 > input.byteLength) throw new Error('Malformed Snappy block: truncated 4-byte copy');
            copyLength = (tag >>> 2) + 1;
            offset = input.readUInt32LE(inputCursor);
            inputCursor += 4;
        }

        if (offset === 0 || offset > outputCursor || outputCursor + copyLength > length) {
            throw new Error('Malformed Snappy block: copy exceeds its output');
        }
        for (let byte = 0; byte < copyLength; byte++)
            output[outputCursor + byte] = output[outputCursor + byte - offset]!;
        outputCursor += copyLength;
    }

    if (outputCursor !== length) throw new Error(`Malformed Snappy block: decoded ${outputCursor} of ${length} bytes`);
    return output;
};
