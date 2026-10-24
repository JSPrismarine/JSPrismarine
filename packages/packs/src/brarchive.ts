/**
 * Reads a `.brarchive`, the container Mojang packs an optimized behavior
 * pack's folders into. From 1.26.50 each vanilla layer folder ships as one
 * archive per folder under `__brarchive/`. The format:
 *
 * ```
 * 8 bytes   magic, 7d 27 25 b1 a0 52 70 26
 * uint32le  entry count
 * uint32le  version, 1
 * count x 256 bytes: uint8 name length, 251 bytes of name, uint32le size
 * the files, in table order, uncompressed
 * ```
 *
 * The table carries sizes rather than offsets, so the files are read back to
 * back and the last file must end exactly where the archive does.
 */

const MAGIC = [0x7d, 0x27, 0x25, 0xb1, 0xa0, 0x52, 0x70, 0x26] as const;
const HEADER_SIZE = 16;
const ENTRY_SIZE = 256;
const NAME_SIZE = 251;

/** Error thrown when bytes are not a readable brarchive. */
export class BrarchiveError extends Error {
    public override name = 'BrarchiveError';
}

/** Whether the bytes start with the brarchive magic number. */
export const isBrarchive = (bytes: Uint8Array): boolean =>
    bytes.length >= MAGIC.length && MAGIC.every((byte, i) => bytes[i] === byte);

/**
 * Reads every file of a brarchive, keyed by member name in table order.
 *
 * @throws {BrarchiveError} When the magic, version or sizes do not match.
 */
export const readBrarchive = (bytes: Uint8Array): Map<string, Uint8Array> => {
    if (!isBrarchive(bytes)) throw new BrarchiveError('not a brarchive: bad magic number');

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(8, true);
    const version = view.getUint32(12, true);
    if (version !== 1) throw new BrarchiveError(`brarchive version ${version} is not readable, only version 1 is`);

    const tableEnd = HEADER_SIZE + count * ENTRY_SIZE;
    if (tableEnd > bytes.byteLength) throw new BrarchiveError('brarchive entry table runs past the end of the data');

    const decoder = new TextDecoder();
    const files = new Map<string, Uint8Array>();
    let cursor = tableEnd;

    for (let i = 0; i < count; i++) {
        const entry = HEADER_SIZE + i * ENTRY_SIZE;
        const nameLength = bytes[entry]!;
        const name = decoder.decode(bytes.subarray(entry + 1, entry + 1 + nameLength));
        const size = view.getUint32(entry + 1 + NAME_SIZE, true);

        if (cursor + size > bytes.byteLength)
            throw new BrarchiveError(`brarchive member ${name} runs past the end of the data`);
        files.set(name, bytes.subarray(cursor, cursor + size));
        cursor += size;
    }

    if (cursor !== bytes.byteLength)
        throw new BrarchiveError(`brarchive files end at ${cursor} of ${bytes.byteLength} bytes`);

    return files;
};
