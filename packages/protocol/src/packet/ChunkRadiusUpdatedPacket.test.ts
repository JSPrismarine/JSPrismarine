import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ChunkRadiusUpdatedPacket from './ChunkRadiusUpdatedPacket';

// Header 0x46 (id 70), then Chunk Radius 12 as a ZigZag varint32 (0x18).
const wire = [0x46, 0x18];

describe('ChunkRadiusUpdatedPacket', () => {
    it('writes Chunk Radius as a ZigZag varint32', () => {
        const buffer = new ChunkRadiusUpdatedPacket({ radius: 12 }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual(wire);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(Buffer.from(wire));
        const data = new ChunkRadiusUpdatedPacket().deserialize(stream);

        expect(data).toEqual({ radius: 12 });
        expect(stream.feof()).toBe(true);
    });
});
