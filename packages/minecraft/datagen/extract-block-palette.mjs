/**
 * Reads the block palettes out of a saved Bedrock world.
 *
 * A sub chunk on disk stores its palette as NBT compounds carrying a name and the states that
 * go with it - the *network* states, not the game's internal ones. That is the thing the
 * script API cannot be asked for: it reports a flattened block's legacy properties as well,
 * and there is no way from inside the game to tell which of them the wire carries.
 */

import { Database } from '@jsprismarine/leveldb';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import fs from 'node:fs';

const SUB_CHUNK_PREFIX = 0x2f;
const BLOCKS_PER_SUB_CHUNK = 4096;

const readPalette = (value) => {
    const stream = new BinaryStream(value);
    const version = stream.readByte();
    if (version !== 8 && version !== 9) return [];

    const storages = stream.readByte();
    if (version === 9) stream.readSignedByte(); // The sub chunk's own y index.

    const found = [];
    for (let storage = 0; storage < storages; storage++) {
        const header = stream.readByte();
        const bitsPerBlock = header >> 1;
        if (bitsPerBlock === 0) break;

        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const words = Math.ceil(BLOCKS_PER_SUB_CHUNK / blocksPerWord);
        for (let i = 0; i < words; i++) stream.readUnsignedIntLE();

        const size = stream.readIntLE();
        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        for (let i = 0; i < size; i++) found.push(reader.parse());
    }

    return found;
};

/** An NBT compound down to plain data, so the rest of this is not writing tag types. */
const plain = (compound) => {
    const out = {};
    for (const [key, value] of compound.children ?? new Map()) {
        out[key] = value && typeof value === 'object' && 'children' in value ? plain(value) : (value?.value ?? value);
    }
    return out;
};

const db = await Database.open(process.argv[2]);
const blocks = new Map();
let subChunks = 0;

for (const [key, value] of db.entries()) {
    // A sub chunk key is 9 or 13 bytes: the chunk position, an optional dimension, the tag,
    // and the sub chunk's index.
    if (key.byteLength !== 10 && key.byteLength !== 14) continue;
    if (key[key.byteLength - 2] !== SUB_CHUNK_PREFIX) continue;

    subChunks++;
    for (const compound of readPalette(value)) {
        const entry = plain(compound);
        if (!entry.name) continue;
        if (!blocks.has(entry.name)) blocks.set(entry.name, entry.states ?? {});
    }
}

await db.close();

const sorted = Object.fromEntries([...blocks.entries()].sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(process.argv[3], `${JSON.stringify(sorted, null, 0)}\n`);
console.log(`${subChunks} sub chunks, ${blocks.size} distinct block names -> ${process.argv[3]}`);
