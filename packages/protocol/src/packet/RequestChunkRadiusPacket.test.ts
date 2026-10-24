import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import RequestChunkRadiusPacket from './RequestChunkRadiusPacket';

// Header 0x45, Chunk Radius 12 as a ZigZag varint (0x18), Max ChunkRadius 32.
const wire = [0x45, 0x18, 0x20];

describe('RequestChunkRadiusPacket', () => {
    it('writes the radius as a ZigZag varint and the max as one byte', () => {
        const buffer = new RequestChunkRadiusPacket({ radius: 12, maxRadius: 32 }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual(wire);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(Buffer.from(wire));
        const data = new RequestChunkRadiusPacket().deserialize(stream);

        expect(data).toEqual({ radius: 12, maxRadius: 32 });
        expect(stream.feof()).toBe(true);
    });
});
