/**
 * Rewrites the block runtime ids in serialized sub chunks, for a session whose release numbers
 * some blocks differently from the world
 * ([ADR 0025](../../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * Only the palettes change. The packed words index into the palette, so they stay as they are,
 * and two world states that one release writes alike simply give the palette two equal entries,
 * which the client accepts. PocketMine-MP's `ChunkSerializer` translates at the same point. The
 * serialized chunk is cached once for every session, and the translated copy is built from those
 * bytes, so a session on the world's release costs nothing more.
 */
import BinaryStream from '@jsprismarine/binaryutils';

/**
 * Copies one sub chunk's block storages from `input` to `output`, translating each palette.
 *
 * The layout `SubChunk.networkSerialize` and `BlockStorage.networkSerialize` write: a version
 * byte, a storage count, the height for version 9, and per storage a header byte whose upper
 * seven bits are the bits per block. A zero-bit storage is one varint id; any other is its
 * packed words, a varint count and the varint ids.
 * @returns Whether any id changed.
 */
const copySubChunk = (input: BinaryStream, output: BinaryStream, toClient: (id: number) => number): boolean => {
    let changed = false;
    const writeId = (id: number): void => {
        const sent = toClient(id);
        if (sent !== id) changed = true;
        output.writeVarInt(sent);
    };

    const version = input.readByte();
    output.writeByte(version);
    const storages = input.readByte();
    output.writeByte(storages);
    // Version 9 names its sub chunk's height after the count.
    if (version === 9) output.writeByte(input.readByte());
    for (let storage = 0; storage < storages; storage++) {
        const header = input.readByte();
        output.writeByte(header);
        const bitsPerBlock = header >> 1;
        if (bitsPerBlock === 0) {
            writeId(input.readVarInt());
            continue;
        }
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        output.write(input.read(Math.ceil(4096 / blocksPerWord) * 4));
        const count = input.readVarInt();
        output.writeVarInt(count);
        for (let entry = 0; entry < count; entry++) writeId(input.readVarInt());
    }
    return changed;
};

/**
 * A `LevelChunk` payload with the block ids of its sub chunks translated.
 *
 * The biomes, border blocks and block entities after the sub chunks are copied as they are.
 * @param payload - The payload `Chunk.networkSerialize` wrote.
 * @param subChunkCount - How many sub chunks it opens with, as the packet declares.
 * @param toClient - The id the session is sent for each world id.
 * @returns The same buffer when nothing changed, and a translated copy otherwise.
 */
export const translateChunkPayload = (
    payload: Buffer,
    subChunkCount: number,
    toClient: (id: number) => number
): Buffer => {
    const input = new BinaryStream(payload);
    const output = new BinaryStream();
    let changed = false;
    for (let index = 0; index < subChunkCount; index++) {
        if (copySubChunk(input, output, toClient)) changed = true;
    }
    if (!changed) return payload;
    output.write(input.readRemaining());
    return output.getBuffer();
};
