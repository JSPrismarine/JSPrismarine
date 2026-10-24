import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import SpawnExperienceOrbPacket from './SpawnExperienceOrbPacket';

describe('SpawnExperienceOrbPacket', () => {
    // Header 0x42, the position 1.5, 2, 3 as little-endian floats, then 5 zigzagged to 10.
    const encoded = Buffer.from([0x42, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40, 0x0a]);

    it('decodes the position and the value, consuming the whole buffer', () => {
        const packet = new SpawnExperienceOrbPacket(encoded);
        packet.decode();

        expect(packet.position).toEqual(new Vector3(1.5, 2, 3));
        expect(packet.xpValue).toBe(5);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the orb back to the same bytes', () => {
        const packet = new SpawnExperienceOrbPacket();
        packet.position = new Vector3(1.5, 2, 3);
        packet.xpValue = 5;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
