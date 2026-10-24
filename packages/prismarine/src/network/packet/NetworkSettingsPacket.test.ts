import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import NetworkSettingsPacket, { CompressionThreshold } from './NetworkSettingsPacket';

describe('network', () => {
    describe('packet', () => {
        describe('NetworkSettingsPacket', () => {
            const HEADER = [0x8f, 0x01]; // 143 as LEB128

            it('writes the five fields in docs order', () => {
                const pk = new NetworkSettingsPacket();
                pk.compressionThreshold = CompressionThreshold.COMPRESS_EVERYTHING;
                pk.compressionAlgorithm = PacketCompressionAlgorithm.ZLIB;
                pk.clientThrottlingEnabled = true;
                pk.clientThrottleThreshold = 200;
                pk.clientThrottleScalar = 0.5;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([
                    ...HEADER,
                    0x01,
                    0x00, // Compression Threshold, uint16 LE
                    0x00,
                    0x00, // CompressionAlgorithm ZLib, uint16 LE
                    0x01, // Client Throttle Enabled
                    0xc8, // Client Throttle Threshold, uint8 and so not sign limited
                    0x00,
                    0x00,
                    0x00,
                    0x3f // Client Throttle Scalar, float LE
                ]);
            });

            it('writes CompressionAlgorithm None across both of its bytes', () => {
                const pk = new NetworkSettingsPacket();
                pk.compressionThreshold = CompressionThreshold.COMPRESS_NOTHING;
                pk.compressionAlgorithm = PacketCompressionAlgorithm.NONE;
                pk.clientThrottlingEnabled = false;
                pk.clientThrottleThreshold = 0;
                pk.clientThrottleScalar = 0;
                pk.encode();

                // 0xffff, which is why the field is two bytes wide rather than one.
                expect([...pk.getBuffer().subarray(HEADER.length + 2, HEADER.length + 4)]).toEqual([0xff, 0xff]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new NetworkSettingsPacket();
                pk.setReadBuffer(Buffer.from([...HEADER, 0x01, 0x00, 0x01, 0x00, 0x00, 0xc8, 0x00, 0x00, 0x00, 0x3f]));
                pk.decode();

                expect(pk.compressionThreshold).toBe(1);
                expect(pk.compressionAlgorithm).toBe(PacketCompressionAlgorithm.SNAPPY);
                expect(pk.clientThrottlingEnabled).toBe(false);
                expect(pk.clientThrottleThreshold).toBe(200);
                expect(pk.clientThrottleScalar).toBeCloseTo(0.5, 6);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(NetworkSettingsPacket.NetID).toBe(Identifiers.NetworkSettingsPacket);
                expect(NetworkSettingsPacket.NetID).toBe(143);
            });
        });
    });
});
