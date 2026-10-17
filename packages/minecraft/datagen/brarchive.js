/**
 * Reads a `.brarchive`, the container Mojang packs a behaviour pack's folders into.
 *
 * From 1.26.50 a Bedrock Dedicated Server ships its vanilla packs "optimized": the recipes,
 * blocks, entities and the rest of each layer are no longer loose JSON files but one archive
 * per folder under `__brarchive/`. The format is as plain as a format gets - a magic number, a
 * count, a table of fixed-width entries, then every file's bytes back to back, uncompressed:
 *
 * ```
 * 8 bytes   magic, 7d 27 25 b1 a0 52 70 26
 * uint32    entries
 * uint32    version, 1
 * entries × 256 bytes: uint8 name length, 251 bytes of name, uint32 size
 * the files, in table order
 * ```
 *
 * Read from the sizes rather than from offsets it does not carry, which is also the check:
 * the last file has to end exactly where the archive does.
 */

import fs from 'node:fs';

const MAGIC = Buffer.from([0x7d, 0x27, 0x25, 0xb1, 0xa0, 0x52, 0x70, 0x26]);
const HEADER = 16;
const ENTRY = 256;
const NAME = 251;

/**
 * The files of an archive, by name.
 * @param {string} file - the path to the archive.
 * @returns {Map<string, Buffer>} each file's bytes, in table order.
 */
export const readArchive = (file) => {
    const buffer = fs.readFileSync(file);
    if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error(`${file} is not a brarchive`);

    const count = buffer.readUInt32LE(8);
    const version = buffer.readUInt32LE(12);
    if (version !== 1) throw new Error(`${file} is brarchive version ${version}, which this does not read`);

    const files = new Map();
    let cursor = HEADER + count * ENTRY;

    for (let i = 0; i < count; i++) {
        const entry = HEADER + i * ENTRY;
        const length = buffer[entry];
        const name = buffer.toString('utf8', entry + 1, entry + 1 + length);
        const size = buffer.readUInt32LE(entry + 1 + NAME);

        files.set(name, buffer.subarray(cursor, cursor + size));
        cursor += size;
    }

    if (cursor !== buffer.byteLength) {
        throw new Error(
            `${file}: the files end at ${cursor} of ${buffer.byteLength} bytes; the table is not what it says`
        );
    }

    return files;
};
