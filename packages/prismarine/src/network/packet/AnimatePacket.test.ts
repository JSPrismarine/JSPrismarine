import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import AnimatePacket from './AnimatePacket';

/**
 * The packet under protocol 2193: header, Action as a uint8, Target Actor Runtime ID as a
 * varuint64, Data as a float, then Swing Source as an optional string. Built by hand so the
 * test pins the layout rather than trusting `encodePayload` to agree with `decodePayload`.
 */
const wireBytes = (action: number, runtimeId: bigint, data: number, swingSource: string | null): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.AnimatePacket);
    out.writeByte(action);
    out.writeUnsignedVarLong(runtimeId);
    out.writeFloatLE(data);
    out.writeBoolean(swingSource !== null);
    if (swingSource !== null) {
        const utf8 = Buffer.from(swingSource, 'utf8');
        out.writeUnsignedVarInt(utf8.byteLength);
        out.write(utf8);
    }
    return out.getBuffer();
};

const decode = (buffer: Buffer): AnimatePacket => {
    const packet = new AnimatePacket(buffer);
    packet.decode();
    return packet;
};

describe('network', () => {
    describe('packet', () => {
        describe('AnimatePacket', () => {
            it('reads a swing with its source, then stops at the end', () => {
                const packet = decode(wireBytes(1, 300n, 0, 'Attack'));

                expect(packet.action).toBe(1);
                expect(packet.runtimeEntityId).toBe(300n);
                expect(packet.data).toBe(0);
                expect(packet.swingSource).toBe('Attack');
                expect(packet.feof()).toBe(true);
            });

            it('reads an absent swing source as null without running past the presence byte', () => {
                const packet = decode(wireBytes(4, 1n, 1.5, null));

                expect(packet.action).toBe(4);
                expect(packet.runtimeEntityId).toBe(1n);
                expect(packet.data).toBeCloseTo(1.5);
                expect(packet.swingSource).toBeNull();
                expect(packet.feof()).toBe(true);
            });

            it('writes action, runtime id, float, then the swing source as an optional string', () => {
                const packet = new AnimatePacket();
                packet.action = 1;
                packet.runtimeEntityId = 300n;
                packet.data = 0;
                packet.swingSource = 'Attack';
                packet.encode();

                const expected = [
                    0x2c, // Header: id 44, no subclient ids.
                    0x01, // Action: Swing.
                    0xac,
                    0x02, // Target Actor Runtime ID: 300 as a varuint64.
                    0x00,
                    0x00,
                    0x00,
                    0x00, // Data: 0 as a float.
                    0x01, // Swing Source present.
                    0x06, // Length 6.
                    ...Buffer.from('Attack', 'utf8')
                ];
                expect([...packet.getBuffer()]).toEqual(expected);
                expect([...packet.getBuffer()]).toEqual([...wireBytes(1, 300n, 0, 'Attack')]);
            });

            it('writes a single zero byte after the float for an absent swing source', () => {
                const packet = new AnimatePacket();
                packet.action = 1;
                packet.runtimeEntityId = 1n;
                packet.swingSource = null;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([0x2c, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
            });
        });
    });
});
