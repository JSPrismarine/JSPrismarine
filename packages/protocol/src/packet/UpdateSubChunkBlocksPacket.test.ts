import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import UpdateSubChunkNetworkBlockInfo from '../structure/UpdateSubChunkNetworkBlockInfo';
import UpdateSubChunkBlocksPacket from './UpdateSubChunkBlocksPacket';

import type { UpdateSubChunkBlocks } from './UpdateSubChunkBlocksPacket';

/** Two first-layer changes and one waterlogging change in the sub chunk at (16, -64, -32). */
const DATA: UpdateSubChunkBlocks = {
    subChunkBlockPosition: new BlockPos(16, -64, -32),
    blocksChanged: {
        standards: [
            new UpdateSubChunkNetworkBlockInfo(new BlockPos(17, -60, -30), 300, 3, 0n, 0),
            new UpdateSubChunkNetworkBlockInfo(new BlockPos(20, -50, -20), 1, 2, 1n << 32n, 2)
        ],
        extras: [new UpdateSubChunkNetworkBlockInfo(new BlockPos(16, -64, -32), 128, 0, 7n, 1)]
    }
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xac, 0x01], // packet id header, varuint32 172
    ...[0x20, 0x7f, 0x3f], // Sub Chunk Block Position: ZigZag 16, -64, -32
    0x02, // Blocks Changed - Standards count, a varuint32
    ...[0x22, 0x77, 0x3b], // Pos: ZigZag 17, -60, -30
    ...[0xac, 0x02], // Runtime Id: varuint32 300
    0x03, // Update Flags: neighbors | network
    0x00, // Sync Message - Entity Unique ID: varuint64 0
    0x00, // Sync Message - Message: none
    ...[0x28, 0x63, 0x27], // Pos: ZigZag 20, -50, -20
    0x01, // Runtime Id: varuint32 1
    0x02, // Update Flags: network
    ...[0x80, 0x80, 0x80, 0x80, 0x10], // Sync Message - Entity Unique ID: varuint64 2^32
    0x02, // Sync Message - Message: actor became a block
    0x01, // Blocks Changed - Extras count, a varuint32
    ...[0x20, 0x7f, 0x3f], // Pos: ZigZag 16, -64, -32
    ...[0x80, 0x01], // Runtime Id: varuint32 128
    0x00, // Update Flags: none
    0x07, // Sync Message - Entity Unique ID: varuint64 7
    0x01 // Sync Message - Message: block became an actor
]);

/** A sub chunk with nothing changed on either layer. */
const EMPTY: UpdateSubChunkBlocks = {
    subChunkBlockPosition: new BlockPos(0, 0, 0),
    blocksChanged: { standards: [], extras: [] }
};

/** `EMPTY` on the wire: the header, three zero coordinates, two zero counts. */
const EMPTY_BYTES = Buffer.from([0xac, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);

describe('UpdateSubChunkBlocksPacket', () => {
    it('writes an empty sub chunk as 5 payload bytes', () => {
        const buffer = new UpdateSubChunkBlocksPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty sub chunk to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new UpdateSubChunkBlocksPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new UpdateSubChunkBlocksPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new UpdateSubChunkBlocksPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
