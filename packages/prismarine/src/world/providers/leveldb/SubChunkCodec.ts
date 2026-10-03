import BinaryStream from '@jsprismarine/binaryutils';

import BlockStorage from '../../chunk/BlockStorage';
import SubChunk from '../../chunk/SubChunk';
import type { SubChunkVersion } from '../../chunk/SubChunk';
import { decodePersistentStorage, encodePersistentStorage } from './PersistentBlockStorage';

/**
 * A `SubChunkPrefix` record's value.
 *
 * Three versions occur. 1 is a single storage with no count byte at all. 8 adds the storage
 * count, which is what made water-logging possible - layer 0 is the block, layer 1 the liquid
 * around it. 9 adds the sub chunk's own index, so a record can say which slice it is rather than
 * relying on the key, and is what 1.18 and later write.
 *
 * The index is signed: -4 is the Overworld's bottom sub chunk.
 */

export interface DecodedSubChunk {
    subChunk: SubChunk;
    /** Present from version 9 onwards; the key's index is authoritative when it is absent. */
    index: number | null;
}

export const encodeSubChunk = (subChunk: SubChunk, index: number, version: SubChunkVersion = 9): Buffer => {
    const stream = new BinaryStream();
    const storages = subChunk.getStorages();

    stream.writeByte(version);

    if (version === 1) {
        if (storages.length > 1) {
            throw new Error('Sub chunk version 1 holds a single layer, so a second one would be lost');
        }
    } else {
        stream.writeByte(storages.length);
        if (version === 9) stream.writeByte(index & 0xff);
    }

    // A version 1 sub chunk with no storage at all still owes the reader one, all air.
    const written = storages.length > 0 ? storages : version === 1 ? [new BlockStorage({})] : [];
    for (const storage of written) encodePersistentStorage(storage, stream);

    return stream.getBuffer();
};

export const decodeSubChunk = (value: Buffer): DecodedSubChunk => {
    const stream = new BinaryStream(value);
    const version = stream.readByte();

    if (version !== 1 && version !== 8 && version !== 9) {
        throw new Error(`Unsupported sub chunk version ${version}`);
    }

    const storageCount = version === 1 ? 1 : stream.readByte();
    // Signed, so 0xfc reads back as -4 rather than 252.
    const index = version === 9 ? (stream.readByte() << 24) >> 24 : null;

    const storages = new Map<number, BlockStorage>();
    for (let layer = 0; layer < storageCount; layer++) {
        storages.set(layer, decodePersistentStorage(stream));
    }

    const subChunk = new SubChunk(storages);
    subChunk.sourceVersion = version;

    return { subChunk, index };
};
