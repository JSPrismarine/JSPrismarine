import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import PlayerLocationPacket, { PlayerLocationPacketType } from './PlayerLocationPacket';

describe('PlayerLocationPacket', () => {
    // Header: id 326 as LEB128 is 0xc6 0x02.
    it('decodes a coordinates update with its selector, type, and position, consuming the whole buffer', () => {
        // Target 1234 zigzags to 0xa4 0x13. Selector 0, type 0. Position 1.5, 2.5, -3 as float LE.
        const packet = new PlayerLocationPacket(
            Buffer.from([
                0xc6, 0x02, 0xa4, 0x13, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x20, 0x40, 0x00, 0x00, 0x40,
                0xc0
            ])
        );
        packet.decode();

        expect(packet.targetActorId).toBe(1234n);
        expect(packet.packetType).toBe(PlayerLocationPacketType.Coordinates);
        expect(packet.position).toEqual(new Vector3(1.5, 2.5, -3));
        expect(packet.feof()).toBe(true);
    });

    it('decodes a hide as selector 1 and type 1 with nothing after', () => {
        // Type 1 zigzags to 2.
        const packet = new PlayerLocationPacket(Buffer.from([0xc6, 0x02, 0x02, 0x01, 0x02]));
        packet.decode();

        expect(packet.targetActorId).toBe(1n);
        expect(packet.packetType).toBe(PlayerLocationPacketType.Hide);
        expect(packet.position).toBeNull();
        expect(packet.feof()).toBe(true);
    });

    it('rejects an unknown alternative', () => {
        const packet = new PlayerLocationPacket(Buffer.from([0xc6, 0x02, 0x02, 0x05, 0x0a]));

        expect(() => packet.decode()).toThrow(/alternative 5/);
    });

    it('encodes a hide as the two discriminators', () => {
        const packet = new PlayerLocationPacket();
        packet.targetActorId = 1n;
        packet.packetType = PlayerLocationPacketType.Hide;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xc6, 0x02, 0x02, 0x01, 0x02]));
    });
});
