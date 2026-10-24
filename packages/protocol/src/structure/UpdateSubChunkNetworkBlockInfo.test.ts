import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from './BlockPos';
import UpdateSubChunkNetworkBlockInfo from './UpdateSubChunkNetworkBlockInfo';

// One group per docs field, in wire order.
const wire = Buffer.from([
    0x28, // Pos X: ZigZag 20
    0x63, // Pos Y: ZigZag -50
    0x27, // Pos Z: ZigZag -20
    0xac,
    0x02, // Runtime Id: varuint32 300
    0x03, // Update Flags: varuint32 neighbors | network
    0x80,
    0x80,
    0x80,
    0x80,
    0x10, // Sync Message - Entity Unique ID: varuint64 2^32
    0x02 // Sync Message - Message: varuint32 2, actor became a block
]);

describe('UpdateSubChunkNetworkBlockInfo', () => {
    it('serializes the five fields in docs order', () => {
        const stream = new NetworkBinaryStream();
        new UpdateSubChunkNetworkBlockInfo(new BlockPos(20, -50, -20), 300, 3, 1n << 32n, 2).serialize(stream);

        expect(stream.getBuffer()).toEqual(wire);
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(wire);
        const info = UpdateSubChunkNetworkBlockInfo.deserialize(stream);

        expect(info.position).toEqual(new BlockPos(20, -50, -20));
        expect(info.runtimeId).toBe(300);
        expect(info.updateFlags).toBe(3);
        expect(info.syncMessageEntityUniqueId).toBe(1n << 32n);
        expect(info.syncMessageType).toBe(2);
        expect(stream.feof()).toBe(true);
    });
});
