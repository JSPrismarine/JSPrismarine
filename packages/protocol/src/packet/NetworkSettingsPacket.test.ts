import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkSettingsPacket from './NetworkSettingsPacket';

import type { NetworkSettings } from './NetworkSettingsPacket';

const DATA: NetworkSettings = {
    compressionThreshold: 1,
    compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
    clientThrottlingEnabled: true,
    clientThrottleThreshold: 200,
    clientThrottleScalar: 0.5
};

/** `DATA` on the wire, header byte included, in the order the docs list the fields. */
const BYTES = Buffer.from([
    0x8f, // packet id 143 as a varuint, first byte
    0x01, // and its second
    0x01, // Compression Threshold 1, little-endian uint16
    0x00,
    0x00, // CompressionAlgorithm ZLib, little-endian uint16
    0x00,
    0x01, // Client Throttle Enabled
    0xc8, // Client Throttle Threshold 200, a uint8 and so not sign limited
    0x00, // Client Throttle Scalar 0.5, little-endian float 0x3f000000
    0x00,
    0x00,
    0x3f
]);

describe('NetworkSettingsPacket', () => {
    it('writes the five fields in the order protocol 2193 defines', () => {
        const buffer = new NetworkSettingsPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new NetworkSettingsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('reads CompressionAlgorithm from both of its bytes', () => {
        // Snappy is 1 and the 1.26.51 docs number None as 2; a reader that took one byte
        // would still get these right and go wrong at `PacketCompressionAlgorithm.NONE`,
        // which `@jsprismarine/minecraft` carries as the 65535 protocol 2207 moved it to.
        const read = (algorithm: [number, number]) =>
            new NetworkSettingsPacket().deserialize(
                new NetworkBinaryStream(
                    Buffer.from([0x8f, 0x01, 0x00, 0x00, ...algorithm, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
                )
            ).compressionAlgorithm;

        expect(read([0x01, 0x00])).toBe(PacketCompressionAlgorithm.SNAPPY);
        expect(read([0x02, 0x00])).toBe(2);
        expect(read([0xff, 0xff])).toBe(PacketCompressionAlgorithm.NONE);
    });

    it('uses packet id 143', () => {
        expect(new NetworkSettingsPacket().id).toBe(143);
    });
});
