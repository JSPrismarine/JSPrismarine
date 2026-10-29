import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import Identifiers from '../Identifiers';
import RequestChunkRadiusPacket from './RequestChunkRadiusPacket';

// Header 0x45, Chunk Radius 12 as a ZigZag varint (0x18), Max ChunkRadius 32.
const wire = [Identifiers.RequestChunkRadiusPacket, 0x18, 0x20];

describe('network', () => {
    describe('packet', () => {
        describe('RequestChunkRadiusPacket', () => {
            it('writes the radius as a ZigZag varint and the max as one byte', () => {
                const pk = new RequestChunkRadiusPacket();
                pk.radius = 12;
                pk.maxRadius = 32;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(wire);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new RequestChunkRadiusPacket();
                pk.setReadBuffer(Buffer.from(wire));
                pk.decode();

                expect(pk.radius).toBe(12);
                expect(pk.maxRadius).toBe(32);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('RequestChunkRadiusPacket')).toBe(Identifiers.RequestChunkRadiusPacket);
                expect(netIdFor('RequestChunkRadiusPacket')).toBe(0x45);
            });
        });
    });
});
