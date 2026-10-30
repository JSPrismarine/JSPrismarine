import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';

import Identifiers from '../Identifiers';
import ChunkRadiusUpdatedPacket from './ChunkRadiusUpdatedPacket';

describe('network', () => {
    describe('packet', () => {
        describe('ChunkRadiusUpdatedPacket', () => {
            it('writes Chunk Radius as a ZigZag varint32', () => {
                const pk = new ChunkRadiusUpdatedPacket();
                pk.radius = 12;
                pk.encode();

                // Header 0x46, then ZigZag(12) = 24.
                expect([...pk.getBuffer()]).toEqual([0x46, 0x18]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new ChunkRadiusUpdatedPacket();
                pk.setReadBuffer(Buffer.from([0x46, 0x18]));
                pk.decode();

                expect(pk.radius).toBe(12);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('ChunkRadiusUpdatedPacket')).toBe(Identifiers.ChunkRadiusUpdatedPacket);
                expect(netIdFor('ChunkRadiusUpdatedPacket')).toBe(0x46);
            });
        });
    });
});
