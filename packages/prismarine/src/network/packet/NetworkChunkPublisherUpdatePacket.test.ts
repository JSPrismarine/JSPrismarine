import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';

import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import NetworkChunkPublisherUpdatePacket from './NetworkChunkPublisherUpdatePacket';

describe('network', () => {
    describe('packet', () => {
        describe('NetworkChunkPublisherUpdatePacket', () => {
            it('writes the position, the radius and a uint32 chunk count in docs order', () => {
                const pk = new NetworkChunkPublisherUpdatePacket();
                pk.position = new BlockPosition(1, -64, 3);
                pk.radius = 128;
                pk.savedChunks = [{ x: -1, z: 2 }];
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([
                    0x79, // Header: id 121, no subclient ids.
                    0x02, // New position for view X: ZigZag(1)
                    0x7f, // New position for view Y: ZigZag(-64)
                    0x06, // New position for view Z: ZigZag(3)
                    0x80,
                    0x01, // New radius for view: 128 as a varuint32
                    0x01,
                    0x00,
                    0x00,
                    0x00, // Server Built Chunks List count: uint32 LE, no size compression
                    0x01, // ChunkPos X: ZigZag(-1)
                    0x04 // ChunkPos Z: ZigZag(2)
                ]);
            });

            it('writes four count bytes for an empty list rather than a single varint zero', () => {
                // A varint count would be one byte, and the client would read three bytes of the
                // next packet as the rest of the count.
                const pk = new NetworkChunkPublisherUpdatePacket();
                pk.position = new BlockPosition(0, 0, 0);
                pk.radius = 0;
                pk.savedChunks = [];
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            });

            it('round-trips position, radius and the chunk list', () => {
                const pk = new NetworkChunkPublisherUpdatePacket();
                pk.position = new BlockPosition(16, -32, 48);
                pk.radius = 128;
                pk.savedChunks = [
                    { x: 1, z: -2 },
                    { x: -3, z: 4 }
                ];
                pk.encode();

                const decoded = new NetworkChunkPublisherUpdatePacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.position.getX()).toBe(16);
                expect(decoded.position.getY()).toBe(-32);
                expect(decoded.position.getZ()).toBe(48);
                expect(decoded.radius).toBe(128);
                expect(decoded.savedChunks).toEqual([
                    { x: 1, z: -2 },
                    { x: -3, z: 4 }
                ]);
                expect(decoded.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('NetworkChunkPublisherUpdatePacket')).toBe(
                    Identifiers.NetworkChunkPublisherUpdatePacket
                );
                expect(netIdFor('NetworkChunkPublisherUpdatePacket')).toBe(0x79);
            });
        });
    });
});
