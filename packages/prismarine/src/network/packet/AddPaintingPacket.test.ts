import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import AddPaintingPacket from './AddPaintingPacket';

describe('AddPaintingPacket', () => {
    // Header 0x16. Unique id 5 zigzags to 10, runtime id 7 is already unsigned, the position
    // is 1.5, 2 and 3, direction 2 zigzags to 4, and "Kebab" is five bytes after its length.
    const encoded = Buffer.from([
        0x16, 0x0a, 0x07, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40, 0x04, 0x05, 0x4b,
        0x65, 0x62, 0x61, 0x62
    ]);

    it('decodes the ids, position, direction and motif, consuming the whole buffer', () => {
        const packet = new AddPaintingPacket(encoded);
        packet.decode();

        expect(packet.targetActorId).toBe(5n);
        expect(packet.targetRuntimeId).toBe(7n);
        expect(packet.position).toEqual(new Vector3(1.5, 2, 3));
        expect(packet.direction).toBe(2);
        expect(packet.motif).toBe('Kebab');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the painting back to the same bytes', () => {
        const packet = new AddPaintingPacket();
        packet.targetActorId = 5n;
        packet.targetRuntimeId = 7n;
        packet.position = new Vector3(1.5, 2, 3);
        packet.direction = 2;
        packet.motif = 'Kebab';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
