import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import InteractPacket, { InteractAction } from './InteractPacket';

/**
 * The packet as the client writes it under protocol 2193: header, Action as a uint8, Target
 * Runtime ID as a varuint64, then the Position optional. Built by hand so the test pins the
 * layout rather than trusting `encodePayload` to agree with `decodePayload`.
 */
const clientBytes = (action: number, target: bigint, position: Vector3 | null): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.InteractPacket);
    out.writeByte(action);
    out.writeUnsignedVarLong(target);
    out.writeBoolean(position !== null);
    if (position !== null) {
        out.writeFloatLE(position.getX());
        out.writeFloatLE(position.getY());
        out.writeFloatLE(position.getZ());
    }
    return out.getBuffer();
};

const decode = (buffer: Buffer): InteractPacket => {
    const packet = new InteractPacket(buffer);
    packet.decode();
    return packet;
};

describe('network', () => {
    describe('packet', () => {
        describe('InteractPacket', () => {
            it('reads action, target and a present position, then stops at the end', () => {
                const packet = decode(clientBytes(4, 300n, new Vector3(1.5, 64, -3.5)));

                expect(packet.action).toBe(InteractAction.MouseOver);
                expect(packet.target).toBe(300n);
                expect(packet.position).not.toBeNull();
                expect(packet.position?.getX()).toBeCloseTo(1.5);
                expect(packet.position?.getY()).toBeCloseTo(64);
                expect(packet.position?.getZ()).toBeCloseTo(-3.5);
                expect(packet.feof()).toBe(true);
            });

            it('reads an absent position as null without running past the presence byte', () => {
                const packet = decode(clientBytes(6, 1n, null));

                expect(packet.action).toBe(InteractAction.OpenInventory);
                expect(packet.target).toBe(1n);
                expect(packet.position).toBeNull();
                expect(packet.feof()).toBe(true);
            });

            it('writes the position as an optional: presence byte, then three floats', () => {
                const packet = new InteractPacket();
                packet.action = InteractAction.MouseOver;
                packet.target = 300n;
                packet.position = new Vector3(1.5, 64, -3.5);
                packet.encode();

                const expected = [
                    0x21, // Header: id 33, no subclient ids.
                    0x04, // Action: InteractUpdate.
                    0xac,
                    0x02, // Target Runtime ID: 300 as a varuint64.
                    0x01, // Position present.
                    0x00,
                    0x00,
                    0xc0,
                    0x3f, // X: 1.5
                    0x00,
                    0x00,
                    0x80,
                    0x42, // Y: 64
                    0x00,
                    0x00,
                    0x60,
                    0xc0 // Z: -3.5
                ];
                expect([...packet.getBuffer()]).toEqual(expected);
            });

            it('writes a single zero byte for an absent position, whatever the action', () => {
                const packet = new InteractPacket();
                packet.action = InteractAction.MouseOver;
                packet.target = 1n;
                packet.position = null;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([0x21, 0x04, 0x01, 0x00]);
            });
        });
    });
});
