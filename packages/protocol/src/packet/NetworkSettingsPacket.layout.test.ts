import BinaryStream from '@jsprismarine/binaryutils';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { networkSettingsPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import { capture, enumDumpMembers } from '../testing/evidence.test.helper';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('409c419c01c50000b040', 'hex');
const payload = {
    compressionThreshold: 40000,
    compressionAlgorithm: 40001,
    clientThrottlingEnabled: true,
    clientThrottleThreshold: 197,
    clientThrottleScalar: 5.5
};

describe('the declarative NetworkSettings layout', () => {
    const layout = layoutAt(networkSettingsPacket, 2193);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});

describe.each([2193, 2225])('NetworkSettings at protocol %i', (protocol) => {
    const layout = layoutAt(networkSettingsPacket, protocol);

    it('decodes the real server capture and re-encodes it byte for byte', () => {
        const raw = capture(protocol, 0x8f);
        const decoded = layout.decode(new BinaryStream(raw));

        expect(decoded).toEqual({
            compressionThreshold: 1,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0
        });

        const stream = new BinaryStream();
        layout.encode(stream, decoded);
        expect(stream.getBuffer()).toEqual(raw);
    });

    it('carries None as 65535 in the algorithm field', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { ...payload, compressionAlgorithm: PacketCompressionAlgorithm.NONE });

        expect(stream.getBuffer().subarray(2, 4)).toEqual(Buffer.from([0xff, 0xff]));
    });
});

describe('PacketCompressionAlgorithm', () => {
    it("numbers None as Mojang's pinned enum dump does, not as the 1.26.50 page does", () => {
        const values = enumDumpMembers('PacketCompressionAlgorithm');

        expect(values).toEqual([
            { name: 'ZLib', value: 0 },
            { name: 'Snappy', value: 1 },
            { name: 'None', value: 65535 }
        ]);
        expect(PacketCompressionAlgorithm.NONE).toBe(65535);
    });
});
